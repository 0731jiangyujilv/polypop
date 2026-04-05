/// <reference types="node" />
/**
 * Standalone script: send a private USDC transfer via the ACE API.
 *
 * Usage:
 *   npm run ace:transfer
 *   # or override recipient / amount:
 *   RECIPIENT=0x... AMOUNT_USDC=1.95 npm run ace:transfer
 *
 * Required env vars (bot/.env):
 *   ACE_API_URL              – ACE backend URL
 *   ACE_PLATFORM_PRIVATE_KEY – sender private key (falls back to BOT_PRIVATE_KEY)
 */
import 'dotenv/config'
import { privateKeyToAccount } from 'viem/accounts'

// ── Config ────────────────────────────────────────────────────────────────────

const ACE_API_URL =
  process.env.ACE_API_URL ?? 'https://convergence2026-token-api.cldev.cloud'

const PRIVATE_KEY = process.env.ACE_PLATFORM_PRIVATE_KEY ?? process.env.BOT_PRIVATE_KEY
if (!PRIVATE_KEY) {
  console.error('❌  ACE_PLATFORM_PRIVATE_KEY / BOT_PRIVATE_KEY not set')
  process.exit(1)
}

const RECIPIENT = (
  process.env.RECIPIENT ?? '0x8fc715c6020f1ce7e38d46165be10e40febeb58e'
) as `0x${string}`

const AMOUNT_USDC = parseFloat(process.env.AMOUNT_USDC ?? '1.95')
const USDC_DECIMALS = 6
const AMOUNT = BigInt(Math.round(AMOUNT_USDC * 10 ** USDC_DECIMALS))

const USDC_TOKEN = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as `0x${string}`

const ACE_DOMAIN = {
  name: 'CompliantPrivateTokenDemo',
  version: '0.0.1',
  chainId: 11155111,
  verifyingContract: '0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13' as `0x${string}`,
} as const

// ── EIP-712 types ─────────────────────────────────────────────────────────────

const TRANSFER_TYPES = {
  'Private Token Transfer': [
    { name: 'sender',    type: 'address'  },
    { name: 'recipient', type: 'address'  },
    { name: 'token',     type: 'address'  },
    { name: 'amount',    type: 'uint256'  },
    { name: 'flags',     type: 'string[]' },
    { name: 'timestamp', type: 'uint256'  },
  ],
} as const

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`)
  const timestamp = BigInt(Date.now())

  console.log('=== ACE Private Transfer ===')
  console.log(`Sender    : ${account.address}`)
  console.log(`Recipient : ${RECIPIENT}`)
  console.log(`Token     : ${USDC_TOKEN} (USDC)`)
  console.log(`Amount    : ${AMOUNT_USDC} USDC (${AMOUNT.toString()} raw)`)
  console.log(`Timestamp : ${timestamp.toString()}`)
  console.log(`ACE URL   : ${ACE_API_URL}`)
  console.log('')

  const auth = await account.signTypedData({
    domain: ACE_DOMAIN,
    types: TRANSFER_TYPES,
    primaryType: 'Private Token Transfer',
    message: {
      sender:    account.address,
      recipient: RECIPIENT,
      token:     USDC_TOKEN,
      amount:    AMOUNT,
      flags:     [],
      timestamp,
    },
  })

  console.log(`Signature : ${auth}`)
  console.log('Submitting to ACE API...')

  const res = await fetch(`${ACE_API_URL}/private-transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account:   account.address,
      recipient: RECIPIENT,
      token:     USDC_TOKEN,
      amount:    AMOUNT.toString(),
      flags:     [],
      timestamp: Number(timestamp),
      auth,
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`❌  ACE /private-transfer failed [${res.status}]: ${text.slice(0, 500)}`)
    process.exit(1)
  }

  const data = JSON.parse(text) as { transaction_id: string }
  console.log('')
  console.log('✅  Transfer submitted!')
  console.log(`Transaction ID: ${data.transaction_id}`)
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
