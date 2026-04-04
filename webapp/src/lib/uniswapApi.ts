const BOT_API = (import.meta.env as Record<string, string>).VITE_BOT_API_URL ?? 'http://localhost:3000'

export const BASE_SEPOLIA_CHAIN_ID = 84532
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

export interface UniswapQuote {
  requestId: string
  routing: string
  quote: {
    input: { amount: string; token: string }
    output: { amount: string; minimumAmount: string; token: string }
    swapper: string
    gas: string
    gasUseEstimateUSD: string
    priceImpact: string
    txData: {
      to: string
      data: string
      value: string
    }
  }
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
