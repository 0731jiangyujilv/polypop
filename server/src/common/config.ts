import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  COINGECKO_API_KEY: z.string().default(""),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  X_PORT: z.coerce.number().default(3100),
  API_BASE_URL: z.string().default("http://localhost:3000"),
  RPC_URL: z.string().default("https://base-sepolia-public.nodies.app"),
  CHAIN_ID: z.coerce.number().default(84532),
  BET_FACTORY_ADDRESS: z.string().default("0x7d2b18a988c38b027420B6F162C1685c4c815e3A"),
  PRICE_ORACLE_FACTORY_ADDRESS: z.string().default(""),
  CONTRACTS_DIR: z.string().default("../contracts"),
  BASESCAN_API_KEY: z.string().default(""),
  VERIFIER_URL: z.string().default("https://api.etherscan.io/v2/api?chainid=84532"),
  VERIFY_ENABLED: z.coerce.boolean().default(false),
  VERIFY_POLL_INTERVAL_MS: z.coerce.number().default(60_000),
  WEBAPP_URL: z.string().default("https://betsys.example.com"),
  PUBLIC_WEBAPP_URL: z.string().optional(),
  BOT_X_USERNAME: z.string().default(""),
  X_API_BASE_URL: z.string().default("https://api.x.com"),
  X_API_BEARER_TOKEN: z.string().default(""),
  X_API_ACCESS_TOKEN: z.string().default(""),
  X_API_CONSUMER_KEY: z.string().default(""),
  X_API_CONSUMER_SECRET: z.string().default(""),
  X_API_ACCESS_TOKEN_SECRET: z.string().default(""),
  X_API_BOT_USER_ID: z.string().default(""),
  POLL_INTERVAL_MS: z.coerce.number().default(15_000),
  DEFAULT_MIN_AMOUNT: z.coerce.number().default(1),
  DEFAULT_MAX_AMOUNT: z.coerce.number().default(1000),
  CREATOR_FEE_BPS: z.coerce.number().default(30),
  TOTAL_FEE_BPS: z.coerce.number().default(100),
  // Admin execution wallet for oracle reporting, lock, and settlement
  BOT_PRIVATE_KEY: z.string().default(""),
  SETTLEMENT_CRON_INTERVAL_MS: z.coerce.number().default(60_000),
  // Arc chain (market chain)
  ARC_RPC_URL: z.string().default("https://rpc.arc-testnet.network"),
  BINARY_MARKET_FACTORY_ADDRESS: z.string().default("0x0000000000000000000000000000000000000000"),
  // Chainlink ACE (Automated Compliance Engine)
  ACE_API_URL: z.string().default("https://convergence2026-token-api.cldev.cloud"),
  ACE_TOKEN_ADDRESS: z.string().default("0x779877A7B0D9E8603169DdbD7836e478b4624789"),
  ACE_PLATFORM_PRIVATE_KEY: z.string().default(""),
  ACE_POLL_INTERVAL_MS: z.coerce.number().default(30_000),
})

export const config = envSchema.parse(process.env)
export const publicWebappUrl = config.PUBLIC_WEBAPP_URL || config.WEBAPP_URL
