const BOT_API = (import.meta.env as Record<string, string>).VITE_BOT_API_URL ?? 'http://localhost:3000'

export const ETH_MAINNET_CHAIN_ID = 1
export const NATIVE_ETH = '0x0000000000000000000000000000000000000000' as const

export interface UniswapQuoteRequest {
  type: 'EXACT_INPUT'
  amount: string
  tokenIn: string
  tokenOut: string
  tokenInChainId: number
  tokenOutChainId: number
  swapper: string
  routingPreference?: string
  autoSlippage?: string
  urgency?: string
}

export interface PermitData {
  domain: Record<string, unknown>
  types: Record<string, unknown>
  values: Record<string, unknown>
}

export interface UniswapQuote {
  requestId: string
  routing: string
  permitData: PermitData | null
  quote: {
    quoteId?: string
    chainId?: number
    input: { amount: string; token: string }
    output: { amount: string; minimumAmount: string; token: string }
    swapper: string
    gas?: string
    gasUseEstimateUSD?: string
    gasFeeUSD?: string
    gasFee?: string
    gasFeeQuote?: string
    gasUseEstimate?: string
    maxFeePerGas?: string
    maxPriorityFeePerGas?: string
    priceImpact?: number | string
    txData?: {
      to: string
      data: string
      value: string
    }
    [key: string]: unknown
  }
}

export interface ApprovalTx {
  to: string
  from: string
  data: string
  value: string
  chainId: number
  gasLimit?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
}

export interface ApprovalResponse {
  requestId: string
  approval: ApprovalTx | null
  cancel?: ApprovalTx | null
  gasFee?: string
}

export interface SwapTx {
  to: string
  from: string
  data: string
  value: string
  chainId: number
  gasLimit?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  gasPrice?: string
}

export interface SwapResponse {
  requestId: string
  swap: SwapTx
}

export interface OrderResponse {
  orderId: string
  orderHash?: string
}

export async function fetchUniswapQuote(req: UniswapQuoteRequest): Promise<UniswapQuote> {
  const res = await fetch(`${BOT_API}/api/uniswap/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routingPreference: 'BEST_PRICE',
      autoSlippage: 'DEFAULT',
      urgency: 'normal',
      ...req,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Uniswap API ${res.status}: ${text.slice(0, 200)}`)
  }

  return res.json() as Promise<UniswapQuote>
}

async function botPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BOT_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Uniswap ${path} [${res.status}]: ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

export interface CheckApprovalRequest {
  walletAddress: string
  token: string
  amount: string
  chainId: number
  includeGasInfo?: boolean
}

export async function checkApproval(req: CheckApprovalRequest): Promise<ApprovalResponse> {
  return botPost('/api/uniswap/check_approval', req)
}

export interface FetchSwapCalldataRequest {
  quote: UniswapQuote['quote']
  signature?: string
  permitData?: PermitData
}

export async function fetchSwapCalldata(req: FetchSwapCalldataRequest): Promise<SwapResponse> {
  return botPost('/api/uniswap/swap', req)
}

export async function submitUniswapOrder(
  quoteResponse: UniswapQuote,
  signature: string,
): Promise<OrderResponse> {
  return botPost('/api/uniswap/order', { ...quoteResponse.quote, signature })
}
