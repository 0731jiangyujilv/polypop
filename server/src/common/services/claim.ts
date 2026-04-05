import { formatUnits, getAddress } from "viem"
import { config } from "../config"
import { BetAbi, getBetAddress, getBetCount, publicClient, walletClient } from "./blockchain"
import { tryAcquireLease } from "./worker-lease"

const POLL_INTERVAL_MS = config.SETTLEMENT_CRON_INTERVAL_MS
const LEASE_KEY = "claim_worker"
const LEASE_TTL_MS = POLL_INTERVAL_MS * 2

let txMutex: Promise<unknown> = Promise.resolve()
let runCounter = 0

function withTxMutex<T>(fn: () => Promise<T>): Promise<T> {
  const next = txMutex.then(fn, fn)
  txMutex = next.catch(() => {})
  return next
}

export function startClaimCron() {
  if (!walletClient) {
    console.warn("💸 Claim worker disabled: BOT_PRIVATE_KEY is not configured")
    return
  }

  console.log(
    `💸 Claim worker started (every ${POLL_INTERVAL_MS}ms) with admin ${walletClient.account.address}`
  )

  const run = async () => {
    const runId = ++runCounter
    const startedAt = Date.now()
    try {
      console.log(`💸 Run #${runId}: tick started at ${new Date(startedAt).toISOString()}`)
      const acquired = await tryAcquireLease(LEASE_KEY, LEASE_TTL_MS)
      if (!acquired) {
        console.log(`💸 Run #${runId}: skipped because lease was not acquired`)
        return
      }
      await processClaimableBets(runId)
      console.log(`💸 Run #${runId}: completed in ${Date.now() - startedAt}ms`)
    } catch (error) {
      console.error(`💸 Run #${runId}: claim worker error:`, error)
    }
  }

  run()
  setInterval(run, POLL_INTERVAL_MS)
}

async function processClaimableBets(runId: number) {
  const betCount = Number(await getBetCount())
  let visited = 0
  let settledBets = 0
  let claimedPlayers = 0
  let unsettledBets = 0

  console.log(`💸 Run #${runId}: scanning ${betCount} bets for claimable players`)

  for (let onChainBetId = 0; onChainBetId < betCount; onChainBetId += 1) {
    const rawBetAddress = await getBetAddress(onChainBetId)
    if (!rawBetAddress || /^0x0{40}$/i.test(rawBetAddress)) {
      console.log(`💸 Run #${runId}: bet #${onChainBetId} skipped because factory returned zero address`)
      continue
    }

    visited += 1
    const contractAddress = getAddress(rawBetAddress)
    const betInfo = await publicClient.readContract({
      address: contractAddress,
      abi: BetAbi,
      functionName: "getBetInfo",
    })

    console.log(
      `💸 Run #${runId}: bet #${onChainBetId} address=${contractAddress} status=${Number(betInfo.status)} totalUp=${betInfo.totalUp?.toString?.() ?? "?"} totalDown=${betInfo.totalDown?.toString?.() ?? "?"} isDraw=${Boolean(betInfo.isDraw)}`
    )

    if (Number(betInfo.status) !== 2) {
      unsettledBets += 1
      console.log(`💸 Run #${runId}: bet #${onChainBetId} skipped because it is not settled yet`)
      continue
    }

    settledBets += 1
    claimedPlayers += await claimForBet(runId, onChainBetId, contractAddress)
  }

  console.log(
    `💸 Run #${runId}: summary visited=${visited} unsettledBets=${unsettledBets} settledBets=${settledBets} autoClaims=${claimedPlayers}`
  )
}

async function claimForBet(runId: number, onChainBetId: number, contractAddress: `0x${string}`): Promise<number> {
  const [upPositions, downPositions] = await Promise.all([
    publicClient.readContract({
      address: contractAddress,
      abi: BetAbi,
      functionName: "getUpPositions",
    }) as Promise<Array<{ player: string; amount: bigint }>>,
    publicClient.readContract({
      address: contractAddress,
      abi: BetAbi,
      functionName: "getDownPositions",
    }) as Promise<Array<{ player: string; amount: bigint }>>,
  ])

  console.log(
    `💸 Run #${runId}: bet #${onChainBetId} fetched positions up=${upPositions.length} down=${downPositions.length}`
  )

  const uniquePlayers = new Set<`0x${string}`>()
  for (const position of [...upPositions, ...downPositions]) {
    uniquePlayers.add(getAddress(position.player))
  }

  console.log(
    `💸 Run #${runId}: bet #${onChainBetId} unique players=${uniquePlayers.size}`
  )

  let claimedPlayers = 0

  for (const player of uniquePlayers) {
    const [claimable, hasClaimed] = await Promise.all([
      publicClient.readContract({
        address: contractAddress,
        abi: BetAbi,
        functionName: "claimable",
        args: [player],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: contractAddress,
        abi: BetAbi,
        functionName: "hasClaimed",
        args: [player],
      }) as Promise<boolean>,
    ])

    console.log(
      `💸 Run #${runId}: bet #${onChainBetId} player=${player} hasClaimed=${hasClaimed} claimable=${claimable.toString()}`
    )

    if (hasClaimed || claimable === 0n) {
      console.log(
        `💸 Run #${runId}: bet #${onChainBetId} player=${player} skipped because ${hasClaimed ? "already claimed" : "claimable is zero"}`
      )
      continue
    }

    await withTxMutex(async () => {
      console.log(`💸 Run #${runId}: bet #${onChainBetId} player=${player} acquired tx mutex for claimFor`)
      const txHash = await walletClient!.writeContract({
        account: walletClient!.account,
        chain: publicClient.chain,
        address: contractAddress,
        abi: BetAbi,
        functionName: "claimFor",
        args: [player],
      })

      console.log(`💸 Run #${runId}: bet #${onChainBetId} player=${player} claimFor tx submitted: ${txHash}`)
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      console.log(`💸 Run #${runId}: bet #${onChainBetId} player=${player} claimFor receipt status=${receipt.status}`)
      if (receipt.status !== "success") {
        throw new Error(`claimFor reverted: ${txHash}`)
      }

      claimedPlayers += 1
      console.log(
        `💸 claimFor succeeded: bet=${contractAddress} player=${player} amount=${formatUnits(claimable, 6)}`
      )
    })
  }

  console.log(`💸 Run #${runId}: bet #${onChainBetId} completed with autoClaims=${claimedPlayers}`)

  return claimedPlayers
}
