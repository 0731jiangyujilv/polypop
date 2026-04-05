import { getAddress } from "viem"
import { config } from "../config"
import { prisma } from "../db"
import { publicClient, PriceOracleFactoryAbi } from "./blockchain"
import { enqueueVerification } from "./verification-queue"

const POLL_INTERVAL_MS = config.POLL_INTERVAL_MS
const CURSOR_KEY = "oracle_listener_last_block"

export async function startOracleListener() {
  if (!config.PRICE_ORACLE_FACTORY_ADDRESS) {
    console.warn("🛰️ Oracle listener disabled: PRICE_ORACLE_FACTORY_ADDRESS is not configured")
    return
  }

  await syncOracleRegistryFromChain()

  const run = async () => {
    try {
      await pollOracleFactoryEvents()
    } catch (error) {
      console.error("🛰️ Oracle listener error:", error)
    }
  }

  await run()
  setInterval(run, POLL_INTERVAL_MS)
}

export async function syncOracleRegistryFromChain() {
  const factoryAddress = getAddress(config.PRICE_ORACLE_FACTORY_ADDRESS)
  const count = await publicClient.readContract({
    address: factoryAddress,
    abi: PriceOracleFactoryAbi as any,
    functionName: "getOracleCount",
  } as any) as bigint

  const activeAssets = new Set<string>()

  for (let i = 0n; i < count; i++) {
    const info = await publicClient.readContract({
      address: factoryAddress,
      abi: PriceOracleFactoryAbi as any,
      functionName: "getOracleInfoAt",
      args: [i],
    } as any) as { asset: string; oracle: string; decimals: number; description: string }

    activeAssets.add(info.asset)

    await (prisma as any).oracleRegistry.upsert({
      where: { asset: info.asset },
      update: {
        oracleAddress: String(info.oracle).toLowerCase(),
        decimals: Number(info.decimals),
        description: info.description,
        isActive: true,
      },
      create: {
        asset: info.asset,
        oracleAddress: String(info.oracle).toLowerCase(),
        decimals: Number(info.decimals),
        description: info.description,
        isActive: true,
      },
    })

    await enqueueVerification({
      contractAddress: String(info.oracle),
      kind: "PRICE_ORACLE",
    })
  }

  await (prisma as any).oracleRegistry.updateMany({
    where: { asset: { notIn: [...activeAssets] } },
    data: { isActive: false },
  })
}

async function pollOracleFactoryEvents() {
  const factoryAddress = getAddress(config.PRICE_ORACLE_FACTORY_ADDRESS)
  const cursor = await prisma.cursor.findUnique({ where: { key: CURSOR_KEY } })
  const currentBlock = await publicClient.getBlockNumber()
  const fromBlock = cursor ? BigInt(cursor.value) + 1n : currentBlock

  if (fromBlock > currentBlock) return

  const logs = await publicClient.getLogs({
    address: factoryAddress,
    fromBlock,
    toBlock: currentBlock,
    events: [
      {
        type: "event",
        name: "OracleAdded",
        inputs: [
          { name: "asset", type: "string", indexed: false },
          { name: "oracle", type: "address", indexed: true },
        ],
      },
      {
        type: "event",
        name: "OracleUpdated",
        inputs: [
          { name: "asset", type: "string", indexed: false },
          { name: "oldOracle", type: "address", indexed: true },
          { name: "newOracle", type: "address", indexed: true },
        ],
      },
      {
        type: "event",
        name: "OracleRemoved",
        inputs: [
          { name: "asset", type: "string", indexed: false },
          { name: "oracle", type: "address", indexed: true },
        ],
      },
      {
        type: "event",
        name: "OracleDescriptionUpdated",
        inputs: [
          { name: "asset", type: "string", indexed: false },
          { name: "oracle", type: "address", indexed: true },
          { name: "description", type: "string", indexed: false },
        ],
      },
    ],
  })

  if (logs.length > 0) {
    await syncOracleRegistryFromChain()
  }

  await prisma.cursor.upsert({
    where: { key: CURSOR_KEY },
    update: { value: currentBlock.toString() },
    create: { key: CURSOR_KEY, value: currentBlock.toString() },
  })
}
