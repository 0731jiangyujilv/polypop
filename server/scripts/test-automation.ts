/**
 * Test script that directly calls registerAutomationUpkeep from automation.ts
 *
 * Usage:
 *   npx tsx scripts/test-automation.ts <betContractAddress>
 *
 * Requires .env with BOT_PRIVATE_KEY, RPC_URL, LINK_TOKEN_ADDRESS,
 * AUTOMATION_REGISTRAR_ADDRESS, etc.
 */
import "dotenv/config"
import { getAddress, formatUnits } from "viem"
import { publicClient } from "../src/services/blockchain"
import { registerAutomationUpkeep } from "../src/services/automation"
import { config } from "../src/config"

const CHECK_UPKEEP_ABI = [
  {
    type: "function",
    name: "checkUpkeep",
    inputs: [{ name: "checkData", type: "bytes" }],
    outputs: [
      { name: "upkeepNeeded", type: "bool" },
      { name: "performData", type: "bytes" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "status",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const

const TARGET = process.argv[2]

if (!TARGET || !/^0x[a-fA-F0-9]{40}$/.test(TARGET)) {
  console.error("❌ Usage: npx tsx scripts/test-automation.ts <betContractAddress>")
  process.exit(1)
}

const target = getAddress(TARGET)

async function main() {
  console.log("=== Test registerAutomationUpkeep ===")
  console.log(`Target              : ${target}`)
  console.log(`RPC_URL             : ${config.RPC_URL}`)
  console.log(`LINK_TOKEN_ADDRESS  : ${config.LINK_TOKEN_ADDRESS}`)
  console.log(`REGISTRAR_ADDRESS   : ${config.AUTOMATION_REGISTRAR_ADDRESS}`)
  console.log(`UPKEEP_FUND_AMOUNT  : ${config.UPKEEP_FUND_AMOUNT} LINK`)
  console.log(`UPKEEP_GAS_LIMIT    : ${config.UPKEEP_GAS_LIMIT}`)
  console.log(`BOT_PRIVATE_KEY     : ${config.BOT_PRIVATE_KEY ? "✅ set" : "❌ not set"}`)
  console.log("")

  // Pre-flight: verify target contract
  console.log("--- Pre-flight: Verify target contract ---")
  try {
    const code = await publicClient.getCode({ address: target })
    if (!code || code === "0x") {
      console.error("❌ Target address has no contract code!")
      process.exit(1)
    }
    console.log(`✅ Contract code present (${Math.floor(code.length / 2) - 1} bytes)`)
  } catch (err: any) {
    console.error("❌ getCode failed:", err.message)
    process.exit(1)
  }

  try {
    const status = await publicClient.readContract({
      address: target,
      abi: CHECK_UPKEEP_ABI,
      functionName: "status",
    })
    console.log(`✅ status() = ${status}`)ck
  } catch (err: any) {
    console.error("⚠️ status() failed:", err.shortMessage || err.message)
  }

  try {
    const [upkeepNeeded, performData] = await publicClient.readContract({
      address: target,
      abi: CHECK_UPKEEP_ABI,
      functionName: "checkUpkeep",
      args: ["0x"],
    })
    console.log(`✅ checkUpkeep() = { upkeepNeeded: ${upkeepNeeded}, performData: ${performData} }`)
  } catch (err: any) {
    console.error("⚠️ checkUpkeep() failed:", err.shortMessage || err.message)
  }

  // Pre-flight: LINK balance (read from walletClient inside automation.ts, just log here)
  console.log("\n--- Pre-flight: LINK balance ---")
  console.log("(Will be checked inside registerAutomationUpkeep)")

  // Call the actual function
  console.log("\n--- Calling registerAutomationUpkeep(target, 'test') ---")
  const result = await registerAutomationUpkeep(target, "test")

  console.log("\n=== Result ===")
  console.log(JSON.stringify(result, null, 2))

  if (result.success) {
    console.log("\n✅ Upkeep registered successfully!")
  } else {
    console.log("\n❌ Registration failed:", result.error)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err)
  process.exit(1)
})
