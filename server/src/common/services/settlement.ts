import { parseUnits, getAddress } from "viem"
import { prisma } from "../db"
import { publicClient, walletClient, BetAbi, PriceOracleAbi, getBetAddress, getBetCount } from "./blockchain"
import { config } from "../config"
import { fetchAssetPrice } from "./market-data"
import { tryAcquireLease } from "./worker-lease"

const POLL_INTERVAL_MS = config.SETTLEMENT_CRON_INTERVAL_MS
const inFlight = new Set<string>()
const LEASE_KEY = "settlement_worker"
const LEASE_TTL_MS = POLL_INTERVAL_MS * 2

let txMutex: Promise<unknown> = Promise.resolve()
let runCounter = 0

function withTxMutex<T>(fn: () => Promise<T>): Promise<T> {
  const next = txMutex.then(fn, fn)
  txMutex = next.catch(() => {})
  return next
}

export function startSettlementCron() {
  if (!walletClient) {
    console.warn("⚖️ Settlement executor disabled: BOT_PRIVATE_KEY is not configured")
    return
  }

  console.log(
    `⚖️ Settlement executor started (every ${POLL_INTERVAL_MS}ms) with admin ${walletClient.account.address}`
  )

  const run = async () => {
    const runId = ++runCounter
    const startedAt = Date.now()
    try {
      console.log(`⚖️ Run #${runId}: tick started at ${new Date(startedAt).toISOString()}`)
      const acquired = await tryAcquireLease(LEASE_KEY, LEASE_TTL_MS)
      if (!acquired) {
        console.log(`⚖️ Run #${runId}: skipped because lease was not acquired`)
        return
      }
      await processDueBets(runId)
      console.log(`⚖️ Run #${runId}: completed in ${Date.now() - startedAt}ms`)
    } catch (err) {
      console.error(`⚖️ Run #${runId}: executor error:`, err)
    }
  }

  run()
  setInterval(run, POLL_INTERVAL_MS)
}

async function processDueBets(runId: number) {
  const betCount = Number(await getBetCount())
  const now = Math.floor(Date.now() / 1000)
  let visited = 0
  let openWaiting = 0
  let lockQueued = 0
  let lockedWaiting = 0
  let settleQueued = 0
  let settled = 0

  console.log(`⚖️ Run #${runId}: scanning ${betCount} bets at now=${now} (${new Date(now * 1000).toISOString()})`)

  for (let onChainBetId = 0; onChainBetId < betCount; onChainBetId += 1) {
    const rawBetAddress = await getBetAddress(onChainBetId)
    if (!rawBetAddress || /^0x0{40}$/i.test(rawBetAddress)) {
      console.log(`⚖️ Run #${runId}: bet #${onChainBetId} skipped because factory returned zero address`)
      continue
    }

    visited += 1
    const contractAddress = getAddress(rawBetAddress)

    let info: any
    try {
      info = await publicClient.readContract({
        address: contractAddress,
        abi: BetAbi,
        functionName: "getBetInfo",
      })
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || String(err)
      console.error(`⚖️ Bet #${onChainBetId}: failed to read on-chain info: ${msg}`)
      continue
    }

    const onChainStatus = Number(info.status)
    const bettingDeadline = Number(info.bettingDeadline)
    const endTime = Number(info.endTime)
    const priceFeed = getAddress(info.priceFeed)
    const asset = String(
      await publicClient.readContract({
        address: contractAddress,
        abi: BetAbi,
        functionName: "asset",
      })
    )

    console.log(
      `⚖️ Run #${runId}: bet #${onChainBetId} address=${contractAddress} asset=${asset} status=${onChainStatus} bettingDeadline=${bettingDeadline} endTime=${endTime} now=${now} totalUp=${info.totalUp?.toString?.() ?? "?"} totalDown=${info.totalDown?.toString?.() ?? "?"}`
    )

    await syncDbState({ onChainBetId, contractAddress }, info)

    if (onChainStatus === 0 && now >= bettingDeadline) {
      if (!asset) {
        console.error(`⚖️ Bet #${onChainBetId}: missing asset metadata, cannot lock`)
        continue
      }

      lockQueued += 1
      console.log(
        `⚖️ Run #${runId}: bet #${onChainBetId} is due for lock because now=${now} >= bettingDeadline=${bettingDeadline}`
      )
      await executeTransition({
        runId,
        betId: onChainBetId,
        asset,
        contractAddress,
        oracleAddress: priceFeed,
        action: "lock",
      })
    } else if (onChainStatus === 1 && now >= endTime) {
      if (!asset) {
        console.error(`⚖️ Bet #${onChainBetId}: missing asset metadata, cannot settle`)
        continue
      }

      settleQueued += 1
      console.log(
        `⚖️ Run #${runId}: bet #${onChainBetId} is due for settle because now=${now} >= endTime=${endTime}`
      )
      await executeTransition({
        runId,
        betId: onChainBetId,
        asset,
        contractAddress,
        oracleAddress: priceFeed,
        action: "settle",
      })
    } else if (onChainStatus === 0) {
      openWaiting += 1
      console.log(
        `⚖️ Run #${runId}: bet #${onChainBetId} not ready to lock yet, waiting ${Math.max(0, bettingDeadline - now)}s until bettingDeadline`
      )
    } else if (onChainStatus === 1) {
      lockedWaiting += 1
      console.log(
        `⚖️ Run #${runId}: bet #${onChainBetId} not ready to settle yet, waiting ${Math.max(0, endTime - now)}s until endTime`
      )
    } else if (onChainStatus === 2) {
      settled += 1
      console.log(`⚖️ Run #${runId}: bet #${onChainBetId} already settled`)
    } else {
      console.log(`⚖️ Run #${runId}: bet #${onChainBetId} has unknown status=${onChainStatus}`)
    }
  }

  console.log(
    `⚖️ Run #${runId}: summary visited=${visited} openWaiting=${openWaiting} lockQueued=${lockQueued} lockedWaiting=${lockedWaiting} settleQueued=${settleQueued} settled=${settled}`
  )
}

async function executeTransition(params: {
  runId: number
  betId: number
  asset: string
  contractAddress: `0x${string}`
  oracleAddress: `0x${string}`
  action: "lock" | "settle"
}) {
  const key = `${params.contractAddress}:${params.action}`
  if (inFlight.has(key)) {
    console.log(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} skipped because ${key} is already in flight`)
    return
  }

  inFlight.add(key)
  console.log(
    `⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} queued with oracle=${params.oracleAddress} contract=${params.contractAddress}`
  )

  try {
    await withTxMutex(async () => {
      console.log(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} acquired tx mutex`)
      const reportTx = await reportLatestOraclePrice(params.asset, params.oracleAddress)
      console.log(`⚖️ Bet #${params.betId}: reported latest ${params.asset} price, tx=${reportTx}`)

      console.log(`⚖️ Run #${params.runId}: bet #${params.betId} sending ${params.action} transaction`)
      const actionTx = await walletClient!.writeContract({
        account: walletClient!.account,
        address: params.contractAddress,
        abi: BetAbi,
        functionName: params.action,
      })

      console.log(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} tx submitted: ${actionTx}`)
      const receipt = await publicClient.waitForTransactionReceipt({ hash: actionTx })
      console.log(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} receipt status=${receipt.status}`)
      if (receipt.status !== "success") {
        throw new Error(`${params.action} tx reverted: ${actionTx}`)
      }

      console.log(`⚖️ Bet #${params.betId}: ${params.action} succeeded, tx=${actionTx}`)

      const refreshedInfo = await publicClient.readContract({
        address: params.contractAddress,
        abi: BetAbi,
        functionName: "getBetInfo",
      })

      await syncDbState(
        { onChainBetId: params.betId, contractAddress: params.contractAddress },
        refreshedInfo
      )
      console.log(
        `⚖️ Run #${params.runId}: bet #${params.betId} post-${params.action} status=${Number(refreshedInfo.status)} startTime=${Number(refreshedInfo.startTime)} endTime=${Number(refreshedInfo.endTime)} startPrice=${refreshedInfo.startPrice?.toString?.() ?? "?"} endPrice=${refreshedInfo.endPrice?.toString?.() ?? "?"}`
      )
    })
  } catch (err: any) {
    const msg = err?.shortMessage || err?.message || String(err)
    console.error(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} failed: ${msg}`)
  } finally {
    inFlight.delete(key)
    console.log(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} finished, removed in-flight key=${key}`)
  }
}

async function reportLatestOraclePrice(asset: string, oracleAddress: `0x${string}`): Promise<`0x${string}`> {
  const [rawPrice, decimals] = await Promise.all([
    fetchAssetPrice(asset),
    publicClient.readContract({
      address: oracleAddress,
      abi: PriceOracleAbi,
      functionName: "decimals",
    }),
  ])

  const scaledPrice = parseUnits(rawPrice, Number(decimals))
  console.log(
    `⚖️ Oracle report: asset=${asset} oracle=${oracleAddress} rawPrice=${rawPrice} decimals=${Number(decimals)} scaledPrice=${scaledPrice.toString()}`
  )

  const reportTx = await walletClient!.writeContract({
    account: walletClient!.account,
    address: oracleAddress,
    abi: PriceOracleAbi,
    functionName: "reportPrice",
    args: [scaledPrice],
  })

  console.log(`⚖️ Oracle report submitted: asset=${asset} tx=${reportTx}`)
  const receipt = await publicClient.waitForTransactionReceipt({ hash: reportTx })
  console.log(`⚖️ Oracle report receipt: asset=${asset} tx=${reportTx} status=${receipt.status}`)
  if (receipt.status !== "success") {
    throw new Error(`oracle report tx reverted: ${reportTx}`)
  }

  return reportTx
}

async function syncDbState(
  betRef: { onChainBetId: number; contractAddress: `0x${string}` },
  info: any
) {
  const statusMap: Record<number, "OPEN" | "LOCKED" | "SETTLED"> = {
    0: "OPEN",
    1: "LOCKED",
    2: "SETTLED",
  }

  const nextStatus = statusMap[Number(info.status)]
  if (!nextStatus) return

  const result = await prisma.bet.updateMany({
    where: {
      OR: [
        { betId: betRef.onChainBetId },
        { contractAddress: betRef.contractAddress },
      ],
    },
    data: {
      status: nextStatus,
      startTime: Number(info.startTime) > 0 ? new Date(Number(info.startTime) * 1000) : null,
      endTime: Number(info.endTime) > 0 ? new Date(Number(info.endTime) * 1000) : null,
      startPrice: Number(info.startPrice) > 0 ? info.startPrice.toString() : null,
      endPrice: Number(info.endPrice) > 0 ? info.endPrice.toString() : null,
      totalUp: info.totalUp?.toString?.() ?? undefined,
      totalDown: info.totalDown?.toString?.() ?? undefined,
      winningSide:
        nextStatus === "SETTLED" && !info.isDraw ? (Number(info.winningSide) === 0 ? "UP" : "DOWN") : null,
      isDraw: Boolean(info.isDraw),
    },
  })

  console.log(
    `⚖️ DB sync: betId=${betRef.onChainBetId} contract=${betRef.contractAddress} matched=${result.count} status=${nextStatus} startTime=${Number(info.startTime)} endTime=${Number(info.endTime)} isDraw=${Boolean(info.isDraw)}`
  )
}
