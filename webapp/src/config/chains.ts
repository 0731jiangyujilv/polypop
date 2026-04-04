import { defineChain } from 'viem'
import { baseSepolia } from 'wagmi/chains'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
      webSocket: ['wss://rpc.testnet.arc.network'],
    },
    public: {
      http: ['https://rpc.testnet.arc.network'],
      webSocket: ['wss://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
})

export const MARKET_CHAIN = arcTestnet
export const SOURCE_CHAIN = baseSepolia

export const MARKET_CHAIN_LABEL = MARKET_CHAIN.name
export const SOURCE_CHAIN_LABEL = SOURCE_CHAIN.name

export function getChainLabel(chainId?: number) {
  if (!chainId) return 'Not connected'
  if (chainId === MARKET_CHAIN.id) return MARKET_CHAIN_LABEL
  if (chainId === SOURCE_CHAIN.id) return SOURCE_CHAIN_LABEL
  return `Unsupported network (Chain ID: ${chainId})`
}

export function getExplorerAddressUrl(address: string, chainId: number = MARKET_CHAIN.id) {
  const baseUrl = chainId === SOURCE_CHAIN.id
    ? SOURCE_CHAIN.blockExplorers.default.url
    : MARKET_CHAIN.blockExplorers.default.url
  return `${baseUrl}/address/${address}`
}
