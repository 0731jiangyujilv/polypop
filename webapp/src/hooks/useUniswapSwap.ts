import { useState, useCallback, useEffect, useRef } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { useAccount, useSendTransaction } from 'wagmi'
import {
  BASE_SEPOLIA_CHAIN_ID,
  NATIVE_ETH,
  fetchUniswapQuote,
} from '@/lib/uniswapApi'
import { SOURCE_USDC_ADDRESS } from '@/config/contracts'

export type SwapStep = 'idle' | 'quoting' | 'quoted' | 'swapping' | 'done' | 'error'

export interface SwapToken {
  symbol: string
  address: string
  decimals: number
}

export const SWAP_TOKENS: SwapToken[] = [
  { symbol: 'ETH', address: NATIVE_ETH, decimals: 18 },
]

interface PendingTx {
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
}

export function useUniswapSwap() {
  const { address } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()

  const [step, setStep] = useState<SwapStep>('idle')
  const [quoteOut, setQuoteOut] = useState('')
  const [priceImpact, setPriceImpact] = useState('')
  const [gasUSD, setGasUSD] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const pendingTx = useRef<PendingTx | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getQuote = useCallback(
    async (token: SwapToken, amountIn: string) => {
      if (!address || !amountIn || Number(amountIn) <= 0) {
        setStep('idle')
        setQuoteOut('')
        return
      }

      if (debounceTimer.current) clearTimeout(debounceTimer.current)

      debounceTimer.current = setTimeout(async () => {
        try {
          setStep('quoting')
          setErrorMsg('')
          setQuoteOut('')

          const amountWei = parseUnits(amountIn, token.decimals).toString()

          const result = await fetchUniswapQuote({
            type: 'EXACT_INPUT',
            amount: amountWei,
            tokenIn: token.address,
            tokenOut: SOURCE_USDC_ADDRESS,
            tokenInChainId: BASE_SEPOLIA_CHAIN_ID,
            tokenOutChainId: BASE_SEPOLIA_CHAIN_ID,
            swapper: address,
          })

          const outRaw = result.quote.output.amount
          setQuoteOut(formatUnits(BigInt(outRaw), 6))
          setPriceImpact(result.quote.priceImpact ?? '')
          setGasUSD(result.quote.gasUseEstimateUSD ?? '')

          const { to, data, value } = result.quote.txData
          pendingTx.current = {
            to: to as `0x${string}`,
            data: data as `0x${string}`,
            value: BigInt(value),
          }

          setStep('quoted')
        } catch (err) {
          setStep('error')
          setErrorMsg(err instanceof Error ? err.message.slice(0, 200) : 'Failed to get quote')
        }
      }, 500)
    },
    [address]
  )

  const executeSwap = useCallback(async () => {
    if (!pendingTx.current) return
    try {
      setStep('swapping')
      const hash = await sendTransactionAsync({
        to: pendingTx.current.to,
        data: pendingTx.current.data,
        value: pendingTx.current.value,
      })
      setTxHash(hash)
      setStep('done')
    } catch (err) {
      setStep('error')
      setErrorMsg(err instanceof Error ? err.message.slice(0, 200) : 'Swap failed')
    }
  }, [sendTransactionAsync])

  const reset = useCallback(() => {
    setStep('idle')
    setQuoteOut('')
    setPriceImpact('')
    setGasUSD('')
    setTxHash(null)
    setErrorMsg('')
    pendingTx.current = null
  }, [])

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  return {
    step,
    quoteOut,
    priceImpact,
    gasUSD,
    txHash,
    errorMsg,
    getQuote,
    executeSwap,
    reset,
    hasQuote: step === 'quoted',
  }
}
