import { SOURCE_CHAIN } from '@/config/chains'
import { SOURCE_USDC_ADDRESS } from '@/config/contracts'

export function getUniswapSwapUrl() {
  const url = new URL('https://app.uniswap.org/swap')
  url.searchParams.set('chain', 'ethereum')
  url.searchParams.set('outputCurrency', SOURCE_USDC_ADDRESS)
  url.searchParams.set('chainId', String(SOURCE_CHAIN.id))
  return url.toString()
}
