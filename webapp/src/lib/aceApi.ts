export const ACE_TOKEN_ADDRESS = '0x779877A7B0D9E8603169DdbD7836e478b4624789' as const
export const ACE_VAULT_ADDRESS = '0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13' as const
export const ACE_CHAIN_ID = 11155111 // Sepolia

export const ACE_DOMAIN = {
  name: 'CompliantPrivateTokenDemo',
  version: '0.0.1',
  chainId: ACE_CHAIN_ID,
  verifyingContract: ACE_VAULT_ADDRESS,
} as const

const BOT_API = import.meta.env.VITE_BOT_API_URL ?? 'http://localhost:3000'

async function postAce<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BOT_API}/api/ace${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ACE ${path} [${res.status}]: ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

export function nowTimestamp(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

export const BALANCE_TYPES = {
  'Retrieve Balances': [
    { name: 'account', type: 'address' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const

export const TRANSACTIONS_TYPES = {
  'List Transactions': [
    { name: 'account', type: 'address' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'cursor', type: 'string' },
    { name: 'limit', type: 'uint256' },
  ],
} as const

export const WITHDRAW_TYPES = {
  'Withdraw Tokens': [
    { name: 'account', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const

export const SHIELDED_ADDRESS_TYPES = {
  'Generate Shielded Address': [
    { name: 'account', type: 'address' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const

export interface AceBalance {
  token: string
  amount: string
}

export async function fetchAceBalances(
  account: `0x${string}`,
  timestamp: bigint,
  auth: `0x${string}`,
): Promise<AceBalance[]> {
  const result = await postAce<{ balances: AceBalance[] }>('/balances', {
    account,
    timestamp: Number(timestamp),
    auth,
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

export async function fetchAceTransactions(
  account: `0x${string}`,
  timestamp: bigint,
  auth: `0x${string}`,
  limit = 20,
): Promise<{ transactions: AceTransaction[]; has_more: boolean }> {
  return postAce('/transactions', {
    account,
    timestamp: Number(timestamp),
    auth,
    cursor: '',
    limit,
  })
}

export async function submitAceWithdraw(
  account: `0x${string}`,
  token: string,
  amount: bigint,
  timestamp: bigint,
  auth: `0x${string}`,
): Promise<{ ticket: string }> {
  return postAce('/withdraw', {
    account,
    token,
    amount: amount.toString(),
    timestamp: Number(timestamp),
    auth,
  })
}

export async function fetchAceShieldedAddress(
  account: `0x${string}`,
  timestamp: bigint,
  auth: `0x${string}`,
): Promise<{ address: string }> {
  return postAce('/shielded-address', {
    account,
    timestamp: Number(timestamp),
    auth,
  })
}
