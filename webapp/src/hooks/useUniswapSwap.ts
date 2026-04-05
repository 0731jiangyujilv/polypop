import { useState, useCallback, useEffect, useRef } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { useAccount, useSendTransaction, useSignTypedData } from 'wagmi'
import {
  ETH_MAINNET_CHAIN_ID,
  NATIVE_ETH,
  fetchUniswapQuote,
  fetchSwapCalldata,
  submitUniswapOrder,
  type UniswapQuote,
} from '@/lib/uniswapApi'
import { SOURCE_USDC_ADDRESS } from '@/config/contracts'

const DUTCH_ROUTINGS = new Set(['DUTCH_V2', 'DUTCH_V3', 'PRIORITY'])

export type SwapStep = 'idle' | 'quoting' | 'quoted' | 'swapping' | 'done' | 'error'

export interface SwapToken {
  symbol: string
  address: string
  decimals: number
}

export const SWAP_TOKENS: SwapToken[] = [
  { symbol: 'ETH', address: NATIVE_ETH, decimals: 18 },
]

export function useUniswapSwap() {
  const { address } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { signTypedDataAsync } = useSignTypedData()

  const [step, setStep] = useState<SwapStep>('idle')
  const [quoteOut, setQuoteOut] = useState('')
  const [priceImpact, setPriceImpact] = useState('')
  const [gasUSD, setGasUSD] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const pendingQuote = useRef<UniswapQuote | null>(null)
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
            tokenInChainId: ETH_MAINNET_CHAIN_ID,
            tokenOutChainId: ETH_MAINNET_CHAIN_ID,
            swapper: address,
          })

          const outRaw = result.quote.output.amount
          setQuoteOut(formatUnits(BigInt(outRaw), 6))
          setPriceImpact(String(result.quote.priceImpact ?? ''))
          setGasUSD(result.quote.gasFeeUSD ?? result.quote.gasUseEstimateUSD ?? '')

          pendingQuote.current = result
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
    const quoteResp = pendingQuote.current
    if (!quoteResp) return
    try {
      setStep('swapping')

      let signature: `0x${string}` | undefined
      if (quoteResp.permitData) {
        signature = await signTypedDataAsync({
          domain: quoteResp.permitData.domain as Parameters<typeof signTypedDataAsync>[0]['domain'],
          types: quoteResp.permitData.types as Parameters<typeof signTypedDataAsync>[0]['types'],
          primaryType: 'PermitSingle',
          message: quoteResp.permitData.values as Parameters<typeof signTypedDataAsync>[0]['message'],
        })
      }

      if (DUTCH_ROUTINGS.has(quoteResp.routing)) {
        await submitUniswapOrder(quoteResp, signature ?? '0x')
      } else {
        const swapResp = await fetchSwapCalldata({
          quote: quoteResp.quote,
          ...(signature && quoteResp.permitData
            ? { signature, permitData: quoteResp.permitData }
            : {}),
        })
        const swap = swapResp.swap
        const hash = await sendTransactionAsync({
          to: swap.to as `0x${string}`,
          data: swap.data as `0x${string}`,
          value: BigInt(swap.value ?? '0'),
          chainId: ETH_MAINNET_CHAIN_ID,
          ...(swap.gasLimit ? { gas: BigInt(swap.gasLimit) } : {}),
          ...(swap.maxFeePerGas ? { maxFeePerGas: BigInt(swap.maxFeePerGas) } : {}),
          ...(swap.maxPriorityFeePerGas
            ? { maxPriorityFeePerGas: BigInt(swap.maxPriorityFeePerGas) }
            : {}),
        })
        setTxHash(hash)
      }

      setStep('done')
    } catch (err) {
      setStep('error')
      setErrorMsg(err instanceof Error ? err.message.slice(0, 200) : 'Swap failed')
    }
  }, [sendTransactionAsync, signTypedDataAsync])

  const reset = useCallback(() => {
    setStep('idle')
    setQuoteOut('')
    setPriceImpact('')
    setGasUSD('')
    setTxHash(null)
    setErrorMsg('')
    pendingQuote.current = null
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
