import "dotenv/config"
import { getAddress } from "viem"
import {
  publicClient,
  walletClient,
  PriceOracleFactoryAbi,
  BetFactoryAbi,
} from "../src/common/services/blockchain"
import { resolveCoinGeckoIdForAsset } from "../src/common/services/market-data"
import { config } from "../src/common/config"

const [, , asset, decimalsArg, ...rest] = process.argv

function usage(): never {
  console.error(`Usage:
  npx tsx scripts/create-oracle-and-set-feed.ts <asset> <decimals> <description> [reporterAddress]

  <asset> must be in SYMBOL/USD format and resolvable from CoinGecko symbol list.

Examples:
  npx tsx scripts/create-oracle-and-set-feed.ts "VIRTUAL/USD" 8 "BetSys VIRTUAL/USD Oracle"
  npx tsx scripts/create-oracle-and-set-feed.ts "BTC/USD" 8 "BetSys BTC/USD Oracle" 0x1234...
  npx tsx scripts/create-oracle-and-set-feed.ts "DOGE/USD" 8 "BetSys DOGE/USD Oracle"
`)
  process.exit(1)
}

function normalizeAssetPair(assetValue: string): string {
  return assetValue.trim().toUpperCase()
}

function requireWallet() {
  if (!walletClient) {
    throw new Error("BOT_PRIVATE_KEY is required")
  }
  return walletClient
}

function requireOracleFactory(): `0x${string}` {
  if (!config.PRICE_ORACLE_FACTORY_ADDRESS) {
    throw new Error("PRICE_ORACLE_FACTORY_ADDRESS is required")
  }
  return getAddress(config.PRICE_ORACLE_FACTORY_ADDRESS)
}

function requireBetFactory(): `0x${string}` {
  if (!config.BET_FACTORY_ADDRESS) {
    throw new Error("BET_FACTORY_ADDRESS is required")
  }
  return getAddress(config.BET_FACTORY_ADDRESS)
}

async function waitForWrite(hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") {
    throw new Error(`transaction reverted: ${hash}`)
  }
  return receipt
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

async function main() {
  if (!asset || !decimalsArg || rest.length === 0) {
    usage()
  }

  const normalizedAsset = normalizeAssetPair(asset)

  const decimals = Number(decimalsArg)
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`Invalid decimals: ${decimalsArg}`)
  }

  const coinGeckoId = await resolveCoinGeckoIdForAsset(normalizedAsset)
  console.log(`Resolved ${normalizedAsset} -> CoinGecko id=${coinGeckoId}`)

  const maybeReporter = rest[rest.length - 1]
  const reporterLooksLikeAddress = /^0x[a-fA-F0-9]{40}$/.test(maybeReporter)
  const descriptionParts = reporterLooksLikeAddress ? rest.slice(0, -1) : rest
  const description = descriptionParts.join(" ").trim()
  if (!description) {
    throw new Error("Description is required")
  }

  const client = requireWallet()
  const reporter = reporterLooksLikeAddress ? getAddress(maybeReporter) : client.account.address

  console.log(`Creating oracle for ${normalizedAsset}...`)
  const createTx = await writePriceOracleFactory("createOracle", [normalizedAsset, decimals, description])
  console.log(`createOracle tx=${createTx}`)

  const oracleAddress = await publicClient.readContract({
    address: requireOracleFactory(),
    abi: PriceOracleFactoryAbi,
    functionName: "getOracle",
    args: [normalizedAsset],
  })
  const oracle = getAddress(oracleAddress)
  console.log(`oracle=${oracle}`)

  console.log(`Setting reporter ${reporter} for ${normalizedAsset}...`)
  const reporterTx = await writePriceOracleFactory("setOracleReporter", [normalizedAsset, reporter, true])
  console.log(`setOracleReporter tx=${reporterTx}`)

  console.log(`Setting BetFactory price feed for ${normalizedAsset} -> ${oracle}...`)
  const feedTx = await writeBetFactory("setPriceFeed", [normalizedAsset, oracle])
  console.log(`setPriceFeed tx=${feedTx}`)

  console.log(`Done: asset=${normalizedAsset} oracle=${oracle} reporter=${reporter}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
