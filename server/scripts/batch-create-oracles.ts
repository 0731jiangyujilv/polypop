import "dotenv/config"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { getAddress, zeroAddress } from "viem"
import {
  publicClient,
  walletClient,
  PriceOracleFactoryAbi,
  BetFactoryAbi,
} from "../src/common/services/blockchain"
import { config } from "../src/common/config"

const COINS_LIST_FILE_PATH = path.resolve(process.cwd(), "scripts/.cache/list.json")

type PlatformFilter = "all" | "base" | "ethereum" | "solana"

interface CoinGeckoCoin {
  id: string
  symbol: string
  platforms?: Record<string, string>
}

interface Options {
  decimals: number
  descriptionPrefix: string
  sleepMs: number
  txSleepMs: number
  limit: number | null
  platform: PlatformFilter
  dryRun: boolean
  reporter: `0x${string}` | null
  failedFile: string
}

function usage() {
  console.error(`Usage:
  npx tsx scripts/batch-create-oracles.ts [options]

Precondition:
  Prepare local CoinGecko list cache at scripts/.cache/list.json

Options:
  --decimals <number>            Oracle decimals (default: 8)
  --description-prefix <text>    Description prefix (default: BetSys)
  --sleep-ms <number>            Delay between assets (default: 5000)
  --tx-sleep-ms <number>         Delay between txs in one asset (default: 1500)
  --limit <number>               Process first N assets
  --platform <all|base|ethereum|solana>
                                 Filter coins by platform address (default: all)
  --reporter <0x...>             Reporter address (default: BOT wallet)
  --failed-file <path>           Failed assets output file (default: .cache/failed-oracles.txt)
  --dry-run                      Print plan only, no tx

Examples:
  npx tsx scripts/batch-create-oracles.ts --platform base --limit 50
  npx tsx scripts/batch-create-oracles.ts --platform all --sleep-ms 1500
  npx tsx scripts/batch-create-oracles.ts --dry-run --platform base --limit 20
`)
  process.exit(1)
}

function parseOptions(argv: string[]): Options {
  const options: Options = {
    decimals: 8,
    descriptionPrefix: "BetSys",
    sleepMs: 5000,
    txSleepMs: 1500,
    limit: null,
    platform: "all",
    dryRun: false,
    reporter: null,
    failedFile: path.resolve(process.cwd(), ".cache/failed-oracles.txt"),
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === "--dry-run") {
      options.dryRun = true
      continue
    }

    if (arg === "--decimals") {
      const v = Number(argv[++i])
      if (!Number.isInteger(v) || v < 0 || v > 255) throw new Error(`Invalid --decimals: ${argv[i]}`)
      options.decimals = v
      continue
    }

    if (arg === "--description-prefix") {
      const v = argv[++i]
      if (!v) throw new Error("Missing value for --description-prefix")
      options.descriptionPrefix = v
      continue
    }

    if (arg === "--sleep-ms") {
      const v = Number(argv[++i])
      if (!Number.isInteger(v) || v < 0) throw new Error(`Invalid --sleep-ms: ${argv[i]}`)
      options.sleepMs = v
      continue
    }

    if (arg === "--tx-sleep-ms") {
      const v = Number(argv[++i])
      if (!Number.isInteger(v) || v < 0) throw new Error(`Invalid --tx-sleep-ms: ${argv[i]}`)
      options.txSleepMs = v
      continue
    }

    if (arg === "--limit") {
      const v = Number(argv[++i])
      if (!Number.isInteger(v) || v <= 0) throw new Error(`Invalid --limit: ${argv[i]}`)
      options.limit = v
      continue
    }

    if (arg === "--platform") {
      const v = argv[++i] as PlatformFilter | undefined
      if (!v || !["all", "base", "ethereum", "solana"].includes(v)) {
        throw new Error(`Invalid --platform: ${argv[i]}`)
      }
      options.platform = v
      continue
    }

    if (arg === "--reporter") {
      const v = argv[++i]
      if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) throw new Error(`Invalid --reporter: ${v}`)
      options.reporter = getAddress(v)
      continue
    }

    if (arg === "--failed-file") {
      const v = argv[++i]
      if (!v) throw new Error("Missing value for --failed-file")
      options.failedFile = path.resolve(process.cwd(), v)
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function requireWallet() {
  if (!walletClient) throw new Error("BOT_PRIVATE_KEY is required")
  return walletClient
}

function requireOracleFactory(): `0x${string}` {
  if (!config.PRICE_ORACLE_FACTORY_ADDRESS) throw new Error("PRICE_ORACLE_FACTORY_ADDRESS is required")
  return getAddress(config.PRICE_ORACLE_FACTORY_ADDRESS)
}

function requireBetFactory(): `0x${string}` {
  if (!config.BET_FACTORY_ADDRESS) throw new Error("BET_FACTORY_ADDRESS is required")
  return getAddress(config.BET_FACTORY_ADDRESS)
}

function normalizeAssetPair(symbol: string): string {
  return `${symbol.trim().toUpperCase()}/USD`
}

function shouldIncludeByPlatform(coin: CoinGeckoCoin, platform: PlatformFilter): boolean {
  if (platform === "all") return true
  const value = coin.platforms?.[platform]
  return typeof value === "string" && value.length > 0
}

async function readCachedCoinGeckoCoins(): Promise<CoinGeckoCoin[]> {
  let raw: string
  try {
    raw = await readFile(COINS_LIST_FILE_PATH, "utf8")
  } catch {
    throw new Error(`Cached list file not found: ${COINS_LIST_FILE_PATH}`)
  }

  let rows: Array<Partial<CoinGeckoCoin>>
  try {
    rows = JSON.parse(raw) as Array<Partial<CoinGeckoCoin>>
  } catch {
    throw new Error(`Invalid JSON in cached list file: ${COINS_LIST_FILE_PATH}`)
  }

  if (!Array.isArray(rows)) {
    throw new Error(`Cached list must be an array: ${COINS_LIST_FILE_PATH}`)
  }

  return rows
    .filter((row): row is CoinGeckoCoin => typeof row?.id === "string" && typeof row?.symbol === "string")
    .map((row) => ({ id: row.id, symbol: row.symbol, platforms: row.platforms || {} }))
}

function buildAssetList(coins: CoinGeckoCoin[], options: Options): string[] {
  const assets = new Set<string>()

  for (const coin of coins) {
    if (!shouldIncludeByPlatform(coin, options.platform)) continue
    const symbol = coin.symbol.trim()
    if (!symbol) continue
    assets.add(normalizeAssetPair(symbol))
  }

  const sorted = [...assets].sort((a, b) => a.localeCompare(b))
  return options.limit ? sorted.slice(0, options.limit) : sorted
}

async function waitForWrite(hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") {
    throw new Error(`transaction reverted: ${hash}`)
  }
}

async function writePriceOracleFactory(functionName: string, args: readonly unknown[]) {
  const client = requireWallet()
  const hash = await client.writeContract({
    account: client.account,
    address: requireOracleFactory(),
    abi: PriceOracleFactoryAbi,
    functionName: functionName as never,
    args: args as never,
  })
  await waitForWrite(hash)
  return hash
}

async function writeBetFactory(functionName: string, args: readonly unknown[]) {
  const client = requireWallet()
  const hash = await client.writeContract({
    account: client.account,
    address: requireBetFactory(),
    abi: BetFactoryAbi,
    functionName: functionName as never,
    args: args as never,
  })
  await waitForWrite(hash)
  return hash
}

async function ensureOracleAndFeed(asset: string, options: Options, reporter: `0x${string}`) {
  let oracle = await publicClient.readContract({
    address: requireOracleFactory(),
    abi: PriceOracleFactoryAbi,
    functionName: "getOracle",
    args: [asset],
  }) as `0x${string}`

  if (oracle === zeroAddress) {
    const desc = `${options.descriptionPrefix} ${asset} Oracle`
    const createTx = await writePriceOracleFactory("createOracle", [asset, options.decimals, desc])
    console.log(`createOracle ${asset} tx=${createTx}`)

    oracle = await publicClient.readContract({
      address: requireOracleFactory(),
      abi: PriceOracleFactoryAbi,
      functionName: "getOracle",
      args: [asset],
    }) as `0x${string}`

    if (oracle === zeroAddress) {
      throw new Error(`createOracle completed but oracle is zero for ${asset}`)
    }
  } else {
    console.log(`skip create ${asset}, existing oracle=${oracle}`)
  }

  if (options.txSleepMs > 0) {
    await sleep(options.txSleepMs)
  }

  const reporterTx = await writePriceOracleFactory("setOracleReporter", [asset, reporter, true])
  console.log(`setOracleReporter ${asset} tx=${reporterTx}`)

  if (options.txSleepMs > 0) {
    await sleep(options.txSleepMs)
  }

  const feedTx = await writeBetFactory("setPriceFeed", [asset, oracle])
  console.log(`setPriceFeed ${asset} tx=${feedTx}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function writeFailedAssets(filePath: string, failed: string[]) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, failed.join("\n"), "utf8")
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const wallet = requireWallet()
  const reporter = options.reporter || wallet.account.address

  const coins = await readCachedCoinGeckoCoins()
  const assets = buildAssetList(coins, options)

  if (assets.length === 0) {
    throw new Error("No assets matched current filters")
  }

  console.log(`Cached CoinGecko coins: ${coins.length}`)
  console.log(`Coins file: ${COINS_LIST_FILE_PATH}`)
  console.log(`Assets to process: ${assets.length}`)
  console.log(`Platform filter: ${options.platform}`)
  console.log(`Reporter: ${reporter}`)
  console.log(`Tx sleep ms: ${options.txSleepMs}`)
  console.log(`Asset sleep ms: ${options.sleepMs}`)
  console.log(`Dry run: ${options.dryRun}`)

  if (options.dryRun) {
    console.log(assets.join("\n"))
    return
  }

  const failed: string[] = []

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i]
    console.log(`[${i + 1}/${assets.length}] ${asset}`)

    try {
      await ensureOracleAndFeed(asset, options, reporter)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`failed ${asset}: ${msg}`)
      failed.push(asset)
    }

    if (options.sleepMs > 0) {
      await sleep(options.sleepMs)
    }
  }

  await writeFailedAssets(options.failedFile, failed)
  console.log(`Done. total=${assets.length}, failed=${failed.length}, failedFile=${options.failedFile}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
