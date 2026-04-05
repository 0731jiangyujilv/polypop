import { privateKeyToAccount } from 'viem/accounts'
import { config } from './config.js'

const ACE_DOMAIN = {
  name: 'CompliantPrivateTokenDemo',
  version: '0.0.1',
  chainId: 11155111,
  verifyingContract: '0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13' as `0x${string}`,
} as const

async function postAce<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.ACE_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ACE ${path} failed [${res.status}]: ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

function platformAccount() {
  const key = config.ACE_PLATFORM_PRIVATE_KEY || config.BOT_PRIVATE_KEY
  if (!key) throw new Error('ACE_PLATFORM_PRIVATE_KEY / BOT_PRIVATE_KEY not set')
  return privateKeyToAccount(key as `0x${string}`)
}

export async function acePrivateTransfer(
  recipient: `0x${string}`,
  amount: bigint,
): Promise<string> {
  const account = platformAccount()
  const timestamp = BigInt(Math.floor(Date.now() / 1000))

  const auth = await account.signTypedData({
    domain: ACE_DOMAIN,
    types: {
      'Private Token Transfer': [
        { name: 'sender', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'flags', type: 'string[]' },
        { name: 'timestamp', type: 'uint256' },
      ],
    },
    primaryType: 'Private Token Transfer',
    message: {
      sender: account.address,
      recipient,
      token: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      amount,
      flags: [],
      timestamp,
    },
  })

  const result = await postAce<{ transaction_id: string }>('/private-transfer', {
    account: account.address,
    recipient,
    token: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    amount: amount.toString(),
    flags: [],
    timestamp: Number(timestamp),
    auth,
  })

  return result.transaction_id
}

export interface AceBalance {
  token: string
  amount: string
}

export async function aceGetBalances(
  userAddress: `0x${string}`,
  authSignature: `0x${string}`,
  timestamp: bigint,
): Promise<AceBalance[]> {
  const result = await postAce<{ balances: AceBalance[] }>('/balances', {
    account: userAddress,
    timestamp: Number(timestamp),
    auth: authSignature,
  })
  return result.balances
}

export interface AceTransaction {
  id: string
  type: 'deposit' | 'withdrawal' | 'transfer'
  account?: string
  sender?: string
  recipient?: string
  token: string
  amount: string
  tx_hash?: string
  is_incoming?: boolean
  is_sender_hidden?: boolean
  withdraw_status?: 'pending' | 'completed' | 'refunded'
}

export async function aceGetTransactions(
  userAddress: `0x${string}`,
  authSignature: `0x${string}`,
  timestamp: bigint,
  limit = 20,
): Promise<{ transactions: AceTransaction[]; has_more: boolean; next_cursor?: string }> {
  return postAce('/transactions', {
    account: userAddress,
    timestamp: Number(timestamp),
    auth: authSignature,
    limit,
  })
}

export interface AceWithdrawResult {
  ticket: string
}

export async function aceWithdraw(
  userAddress: `0x${string}`,
  token: string,
  amount: bigint,
  authSignature: `0x${string}`,
  timestamp: bigint,
): Promise<AceWithdrawResult> {
  return postAce('/withdraw', {
    account: userAddress,
    token,
    amount: amount.toString(),
    timestamp: Number(timestamp),
    auth: authSignature,
  })
}

export async function aceGetShieldedAddress(
  userAddress: `0x${string}`,
  authSignature: `0x${string}`,
  timestamp: bigint,
): Promise<{ address: string }> {
  return postAce('/shielded-address', {
    account: userAddress,
    timestamp: Number(timestamp),
    auth: authSignature,
  })
}
