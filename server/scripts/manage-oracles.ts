import "dotenv/config"
import { getAddress } from "viem"
import {
  publicClient,
  walletClient,
  PriceOracleFactoryAbi,
} from "../src/common/services/blockchain"
import { config } from "../src/common/config"

type Command =
  | "list"
  | "get"
  | "create"
  | "add"
  | "update"
  | "remove"
  | "set-reporter"
  | "set-description"

const [, , rawCommand, ...args] = process.argv
const command = rawCommand as Command | undefined

const factoryAddress = config.PRICE_ORACLE_FACTORY_ADDRESS
  ? getAddress(config.PRICE_ORACLE_FACTORY_ADDRESS)
  : null

function usage(): never {
  console.error(`Usage:
  npx tsx scripts/manage-oracles.ts list
  npx tsx scripts/manage-oracles.ts get <asset>
  npx tsx scripts/manage-oracles.ts create <asset> <decimals> <description>
  npx tsx scripts/manage-oracles.ts add <asset> <oracleAddress>
  npx tsx scripts/manage-oracles.ts update <asset> <oracleAddress>
  npx tsx scripts/manage-oracles.ts remove <asset>
  npx tsx scripts/manage-oracles.ts set-reporter <asset> <reporterAddress> <true|false>
  npx tsx scripts/manage-oracles.ts set-description <asset> <description>`)
  process.exit(1)
}

function requireFactory(): `0x${string}` {
  if (!factoryAddress) {
    throw new Error("PRICE_ORACLE_FACTORY_ADDRESS is required")
  }
  return factoryAddress
}

function requireWallet() {
  if (!walletClient) {
    throw new Error("BOT_PRIVATE_KEY is required for write operations")
  }
  return walletClient
}

function parseBool(value: string): boolean {
  if (value === "true") return true
  if (value === "false") return false
  throw new Error(`Invalid boolean: ${value}`)
}

async function waitForWrite(hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") {
    throw new Error(`transaction reverted: ${hash}`)
  }
  return receipt
}

async function listOracles() {
  const address = requireFactory()
  const count = await publicClient.readContract({
    address,
    abi: PriceOracleFactoryAbi,
    functionName: "getOracleCount",
  })

  if (count === 0n) {
    console.log("No oracles registered.")
    return
  }

  for (let i = 0n; i < count; i++) {
    const info = await publicClient.readContract({
      address,
      abi: PriceOracleFactoryAbi,
      functionName: "getOracleInfoAt",
      args: [i],
    })

    console.log(`${Number(i)}. ${info.asset}`)
    console.log(`   oracle      ${info.oracle}`)
    console.log(`   decimals    ${info.decimals}`)
    console.log(`   description ${info.description}`)
  }
}

async function getOracle(asset: string) {
  const info = await publicClient.readContract({
    address: requireFactory(),
    abi: PriceOracleFactoryAbi,
    functionName: "getOracleInfo",
    args: [asset],
  })

  console.log(JSON.stringify(info, null, 2))
}

async function writeFactory(functionName: string, args_: readonly unknown[]) {
  const client = requireWallet()
  const hash = await client.writeContract({
    account: client.account,
    address: requireFactory(),
    abi: PriceOracleFactoryAbi,
    functionName: functionName as never,
    args: args_ as never,
  })
  await waitForWrite(hash)
  console.log(`tx=${hash}`)
}

async function main() {
  switch (command) {
    case "list":
      await listOracles()
      return
    case "get":
      if (args.length !== 1) usage()
      await getOracle(args[0])
      return
    case "create":
      if (args.length < 3) usage()
      await writeFactory("createOracle", [args[0], Number(args[1]), args.slice(2).join(" ")])
      return
    case "add":
      if (args.length !== 2) usage()
      await writeFactory("addOracle", [args[0], getAddress(args[1])])
      return
    case "update":
      if (args.length !== 2) usage()
      await writeFactory("updateOracle", [args[0], getAddress(args[1])])
      return
    case "remove":
      if (args.length !== 1) usage()
      await writeFactory("removeOracle", [args[0]])
      return
    case "set-reporter":
      if (args.length !== 3) usage()
      await writeFactory("setOracleReporter", [args[0], getAddress(args[1]), parseBool(args[2])])
      return
    case "set-description":
      if (args.length < 2) usage()
      await writeFactory("setOracleDescription", [args[0], args.slice(1).join(" ")])
      return
    default:
      usage()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
