/**
 * Local test script for bet intent parsing.
 *
 * Usage:
 *   npm run test:intent
 *   npm run test:intent -- "VIRTUAL in 3.21" "VIRTUAL in tomorrow"
 *
 * Requires .env with OPENAI_API_KEY.
 */
import "dotenv/config"
import { parseBetIntent } from "../src/common/services/openai"

const samples = process.argv.slice(2)

if (samples.length === 0) {
  console.error("Please provide at least one test input.")
  console.error("Usage: npm run test:intent -- \"VIRTUAL in 3.21\" \"BTC in 5m\"")
  process.exit(1)
}

const testInputs = samples

async function main() {
  console.log("=== Bet Intent Parser Test ===")
  console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "set" : "missing"}`)
  console.log("")

  for (const [index, input] of testInputs.entries()) {
    console.log(`--- Case ${index + 1} ---`)
    console.log(`Input : ${input}`)

    try {
      const result = await parseBetIntent(input)
      console.log("Output:")
      console.log(JSON.stringify(result, null, 2))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log("Output:")
      console.log(JSON.stringify({ error: message }, null, 2))
    }

    console.log("")
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error)
  process.exit(1)
})
