import 'dotenv/config'
import { createPublicClient, createWalletClient, http, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { config } from './common/config.js'
import { acePrivateTransfer } from './common/aceApi.js'

const ARC_CHAIN = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
  rpcUrls: { default: { http: [config.ARC_RPC_URL] } },
} as const

const arcClient = createPublicClient({ chain: ARC_CHAIN, transport: http(config.ARC_RPC_URL) })

function getWorkerWalletClient() {
  const key = config.ACE_PLATFORM_PRIVATE_KEY || config.BOT_PRIVATE_KEY
  if (!key) throw new Error('ACE_PLATFORM_PRIVATE_KEY / BOT_PRIVATE_KEY not set')
  const account = privateKeyToAccount(key as `0x${string}`)
  return createWalletClient({ account, chain: ARC_CHAIN, transport: http(config.ARC_RPC_URL) })
}

const FACTORY_ABI = [
  { inputs: [], name: 'getMarketCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'marketId', type: 'uint256' }], name: 'getMarket', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

const BOT_API_BASE = config.API_BASE_URL || 'http://localhost:3210'

async function getPrivacySettings(walletAddress: string): Promise<{ shieldedAddress: string | null; privacyMode: boolean }> {
  try {
    const res = await fetch(`${BOT_API_BASE}/api/user/privacy/${walletAddress.toLowerCase()}`)
    if (!res.ok) return { shieldedAddress: null, privacyMode: false }
    return res.json() as Promise<{ shieldedAddress: string | null; privacyMode: boolean }>
  } catch {
    return { shieldedAddress: null, privacyMode: false }
  }
}

const MARKET_ABI = [
  {
    inputs: [],
    name: 'getMarketInfo',
    outputs: [{
      name: 'info', type: 'tuple',
      components: [
        { name: 'creator', type: 'address' }, { name: 'token', type: 'address' },
        { name: 'question', type: 'string' }, { name: 'minAmount', type: 'uint256' },
        { name: 'maxAmount', type: 'uint256' }, { name: 'duration', type: 'uint256' },
        { name: 'bettingDeadline', type: 'uint256' }, { name: 'startTime', type: 'uint256' },
        { name: 'endTime', type: 'uint256' }, { name: 'status', type: 'uint8' },
        { name: 'resolvedOutcome', type: 'uint8' }, { name: 'isDraw', type: 'bool' },
        { name: 'totalYes', type: 'uint256' }, { name: 'totalNo', type: 'uint256' },
        { name: 'prizePool', type: 'uint256' }, { name: 'feeBps', type: 'uint256' },
        { name: 'feeRecipient', type: 'address' },
      ],
    }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getYesPositions',
    outputs: [{ name: '', type: 'tuple[]', components: [{ name: 'player', type: 'address' }, { name: 'amount', type: 'uint256' }] }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getNoPositions',
    outputs: [{ name: '', type: 'tuple[]', components: [{ name: 'player', type: 'address' }, { name: 'amount', type: 'uint256' }] }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'claimByWorker',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'privacyMode',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKET_STATUS_RESOLVED = 2

const processedMarkets = new Set<string>()

async function processResolvedMarket(marketAddress: `0x${string}`) {
  if (processedMarkets.has(marketAddress)) return

  const info = await arcClient.readContract({
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: 'getMarketInfo',
  }) as {
    status: number; resolvedOutcome: number; isDraw: boolean;
    totalYes: bigint; totalNo: bigint; prizePool: bigint;
  }

  if (info.status !== MARKET_STATUS_RESOLVED) return

  processedMarkets.add(marketAddress)

  if (info.isDraw || info.prizePool === 0n) {
    console.log(`[ACE] Market ${marketAddress} is draw or empty — skip ACE transfer`)
    return
  }

  const winningOutcome = info.resolvedOutcome // 0=No, 1=Yes
  const winners = await arcClient.readContract({
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: winningOutcome === 1 ? 'getYesPositions' : 'getNoPositions',
  }) as Array<{ player: `0x${string}`; amount: bigint }>

  const winningTotal = winningOutcome === 1 ? info.totalYes : info.totalNo

  console.log(`[ACE] Market ${marketAddress} resolved — ${winners.length} winner(s), prizePool=${info.prizePool}`)

  const walletClient = getWorkerWalletClient()

  for (const pos of winners) {
    const payout = (info.prizePool * pos.amount) / winningTotal
    if (payout === 0n) continue

    const privacy = await getPrivacySettings(pos.player)

    if (!privacy.privacyMode || !privacy.shieldedAddress) {
      console.log(`[ACE] ${pos.player} has no privacy mode — skipping ACE payout (on-chain claim available)`)
      continue
    }

    try {
      console.log(`[ACE] ${pos.player} has privacy mode → claimByWorker then private-transfer to ${privacy.shieldedAddress}`)

      const claimTx = await walletClient.writeContract({
        address: marketAddress,
        abi: MARKET_ABI,
        functionName: 'claimByWorker',
        args: [pos.player],
      })
      await arcClient.waitForTransactionReceipt({ hash: claimTx })
      console.log(`[ACE] claimByWorker for ${pos.player} — tx: ${claimTx}`)

      const txId = await acePrivateTransfer(privacy.shieldedAddress as `0x${string}`, payout)
      console.log(`[ACE] private-transfer ${payout} → ${privacy.shieldedAddress} — tx_id: ${txId}`)
    } catch (err) {
      console.error(`[ACE] Failed payout for ${pos.player}:`, err)
    }
  }
}

async function tick() {
  if (!config.BINARY_MARKET_FACTORY_ADDRESS || config.BINARY_MARKET_FACTORY_ADDRESS === zeroAddress) {
    console.log('[ACE] BINARY_MARKET_FACTORY_ADDRESS not configured — skipping')
    return
  }

  try {
    const count = await arcClient.readContract({
      address: config.BINARY_MARKET_FACTORY_ADDRESS as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'getMarketCount',
    }) as bigint

    for (let i = 0n; i < count; i++) {
      const marketAddress = await arcClient.readContract({
        address: config.BINARY_MARKET_FACTORY_ADDRESS as `0x${string}`,
        abi: FACTORY_ABI,
        functionName: 'getMarket',
        args: [i],
      }) as `0x${string}`

      await processResolvedMarket(marketAddress)
    }
  } catch (err) {
    console.error('[ACE] tick error:', err)
  }
}

async function main() {
  console.log('[ACE] Worker started — polling Arc every', config.ACE_POLL_INTERVAL_MS, 'ms')
  await tick()
  setInterval(tick, config.ACE_POLL_INTERVAL_MS)
}

main().catch(console.error)
