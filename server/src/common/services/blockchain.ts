import { createPublicClient, createWalletClient, http, getAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { baseSepolia } from "viem/chains"
import { config } from "../config"

// Admin execution wallet. Used for oracle reporting and bet lock/settle transactions.

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(config.RPC_URL),
})

// Wallet client for admin-driven execution (only created if BOT_PRIVATE_KEY is set)
export const walletClient = config.BOT_PRIVATE_KEY
  ? createWalletClient({
      account: privateKeyToAccount(config.BOT_PRIVATE_KEY as `0x${string}`),
      chain: baseSepolia,
      transport: http(config.RPC_URL),
    })
  : null

export const BetFactoryAbi = [
  {
    type: "function",
    name: "setPriceFeed",
    inputs: [
      { name: "asset", type: "string" },
      { name: "feed", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getBet",
    inputs: [{ name: "betId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBetCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPriceFeed",
    inputs: [{ name: "asset", type: "string" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "BetCreated",
    inputs: [
      { name: "betId", type: "uint256", indexed: true },
      { name: "betContract", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: false },
      { name: "token", type: "address", indexed: false },
      { name: "asset", type: "string", indexed: false },
    ],
  },
] as const

export const BetAbi = [
  {
    type: "function",
    name: "asset",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "status",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "endTime",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "bettingDeadline",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalUp",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalDown",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "creator",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBetInfo",
    inputs: [],
    outputs: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "token", type: "address" },
          { name: "minAmount", type: "uint256" },
          { name: "maxAmount", type: "uint256" },
          { name: "duration", type: "uint256" },
          { name: "bettingDeadline", type: "uint256" },
          { name: "priceFeed", type: "address" },
          { name: "startPrice", type: "int256" },
          { name: "endPrice", type: "int256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "winningSide", type: "uint8" },
          { name: "isDraw", type: "bool" },
          { name: "totalUp", type: "uint256" },
          { name: "totalDown", type: "uint256" },
          { name: "prizePool", type: "uint256" },
          { name: "feeBps", type: "uint256" },
          { name: "feeRecipient", type: "address" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lock",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settle",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimFor",
    inputs: [{ name: "player", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimable",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasClaimed",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getUpPositions",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "player", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDownPositions",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "player", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "BetPlaced",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "side", type: "uint8", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BetLocked",
    inputs: [
      { name: "startPrice", type: "int256", indexed: false },
      { name: "startTime", type: "uint256", indexed: false },
      { name: "endTime", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BetSettled",
    inputs: [
      { name: "winningSide", type: "uint8", indexed: false },
      { name: "isDraw", type: "bool", indexed: false },
      { name: "endPrice", type: "int256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "FeesCollected",
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const

export const PriceOracleAbi = [
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reportPrice",
    inputs: [{ name: "answer", type: "int256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const

export const PriceOracleFactoryAbi = [
  {
    type: "function",
    name: "getOracle",
    inputs: [{ name: "asset", type: "string" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOracleInfo",
    inputs: [{ name: "asset", type: "string" }],
    outputs: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "asset", type: "string" },
          { name: "oracle", type: "address" },
          { name: "decimals", type: "uint8" },
          { name: "description", type: "string" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOracleCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOracleInfoAt",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "asset", type: "string" },
          { name: "oracle", type: "address" },
          { name: "decimals", type: "uint8" },
          { name: "description", type: "string" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createOracle",
    inputs: [
      { name: "asset", type: "string" },
      { name: "decimals_", type: "uint8" },
      { name: "description_", type: "string" },
    ],
    outputs: [{ name: "oracle", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addOracle",
    inputs: [
      { name: "asset", type: "string" },
      { name: "oracle", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateOracle",
    inputs: [
      { name: "asset", type: "string" },
      { name: "newOracle", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removeOracle",
    inputs: [{ name: "asset", type: "string" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setOracleReporter",
    inputs: [
      { name: "asset", type: "string" },
      { name: "reporter", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setOracleDescription",
    inputs: [
      { name: "asset", type: "string" },
      { name: "description_", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const

export async function getBetCount(): Promise<bigint> {
  return publicClient.readContract({
    address: getAddress(config.BET_FACTORY_ADDRESS),
    abi: BetFactoryAbi,
    functionName: "getBetCount",
  })
}

export async function getBetAddress(betId: number): Promise<string> {
  const addr = await publicClient.readContract({
    address: getAddress(config.BET_FACTORY_ADDRESS),
    abi: BetFactoryAbi,
    functionName: "getBet",
    args: [BigInt(betId)],
  })
  return addr
}

export async function getBetInfo(betAddress: string) {
  return publicClient.readContract({
    address: getAddress(betAddress),
    abi: BetAbi,
    functionName: "getBetInfo",
  })
}

export async function getPriceFeed(asset: string): Promise<string> {
  return publicClient.readContract({
    address: getAddress(config.BET_FACTORY_ADDRESS),
    abi: BetFactoryAbi,
    functionName: "getPriceFeed",
    args: [asset],
  })
}
