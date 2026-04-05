import { useState, useEffect, useRef } from 'react'
import { useAccount, useChainId, useSendTransaction, useSignTypedData, useSwitchChain, useBalance } from 'wagmi'
import { parseEther, formatUnits } from 'viem'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { SOURCE_USDC_ADDRESS } from '@/config/contracts'
import {
  fetchUniswapQuote,
  fetchSwapCalldata,
  submitUniswapOrder,
  NATIVE_ETH,
  ETH_MAINNET_CHAIN_ID,
  type UniswapQuote,
} from '@/lib/uniswapApi'

type TxStep =
  | 'idle'
  | 'quoting'
  | 'quoted'
  | 'signing-permit'
  | 'building-swap'
  | 'confirming'
  | 'done'
  | 'error'

const DUTCH_ROUTINGS = new Set(['DUTCH_V2', 'DUTCH_V3', 'PRIORITY'])

function routingLabel(routing: string) {
  switch (routing) {
    case 'CLASSIC': return 'Uniswap AMM'
    case 'DUTCH_V2': return 'UniswapX V2'
    case 'DUTCH_V3': return 'UniswapX V3'
    case 'PRIORITY': return 'UniswapX Priority'
    case 'WRAP': return 'WETH Wrap'
    case 'UNWRAP': return 'WETH Unwrap'
    default: return routing
  }
}

function stepButtonLabel(step: TxStep): string {
  switch (step) {
    case 'signing-permit': return 'Sign Permit...'
    case 'building-swap': return 'Building Transaction...'
    case 'confirming': return 'Confirm in Wallet...'
    case 'done': return '✓ Swap Complete'
    default: return 'Swap'
  }
}

export function SwapPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { data: ethBalance } = useBalance({ address, chainId: ETH_MAINNET_CHAIN_ID })

  const { signTypedDataAsync } = useSignTypedData()
  const { sendTransactionAsync } = useSendTransaction()

  const [ethAmount, setEthAmount] = useState('')
  const [quote, setQuote] = useState<UniswapQuote | null>(null)
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [txHash, setTxHash] = useState('')
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isOnEthMainnet = chainId === ETH_MAINNET_CHAIN_ID
  const isBusy = txStep === 'signing-permit' || txStep === 'building-swap' || txStep === 'confirming'

  useEffect(() => {
    setQuote(null)
    setErrorMsg('')
    setTxHash('')

    const amount = parseFloat(ethAmount)
    if (!address || !ethAmount || isNaN(amount) || amount <= 0) {
      setTxStep('idle')
      return
    }

    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current)
    setTxStep('quoting')

    quoteTimerRef.current = setTimeout(async () => {
      try {
        const q = await fetchUniswapQuote({
          type: 'EXACT_INPUT',
          amount: parseEther(ethAmount).toString(),
          tokenIn: NATIVE_ETH,
          tokenOut: SOURCE_USDC_ADDRESS,
          tokenInChainId: ETH_MAINNET_CHAIN_ID,
          tokenOutChainId: ETH_MAINNET_CHAIN_ID,
          swapper: address,
        })
        setQuote(q)
        setTxStep('quoted')
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : String(e))
        setTxStep('error')
      }
    }, 600)
  }, [address, ethAmount])

  const handleSwap = async () => {
    if (!address || !quote) return
    setErrorMsg('')
    setTxHash('')

    try {
      let signature: `0x${string}` | undefined

      if (quote.permitData) {
        setTxStep('signing-permit')
        signature = await signTypedDataAsync({
          domain: quote.permitData.domain as Parameters<typeof signTypedDataAsync>[0]['domain'],
          types: quote.permitData.types as Parameters<typeof signTypedDataAsync>[0]['types'],
          primaryType: 'PermitSingle',
          message: quote.permitData.values as Parameters<typeof signTypedDataAsync>[0]['message'],
        })
      }

      if (DUTCH_ROUTINGS.has(quote.routing)) {
        setTxStep('building-swap')
        await submitUniswapOrder(quote, signature ?? '0x')
        setTxStep('done')
      } else {
        setTxStep('building-swap')
        const swapResp = await fetchSwapCalldata({
          quote: quote.quote,
          ...(signature && quote.permitData
            ? { signature, permitData: quote.permitData }
            : {}),
        })

        const swap = swapResp.swap
        if (!swap.data || swap.data === '' || swap.data === '0x') {
          throw new Error('Invalid swap transaction: empty data field')
        }

        setTxStep('confirming')
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
        setTxStep('done')
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setTxStep('error')
    }
  }

  const usdcOut = quote?.quote?.output?.amount
    ? parseFloat(formatUnits(BigInt(quote.quote.output.amount), 6)).toFixed(4)
    : ''

  const minUsdcOut = quote?.quote?.output?.minimumAmount
    ? parseFloat(formatUnits(BigInt(quote.quote.output.minimumAmount), 6)).toFixed(4)
    : ''

  const ethBalanceFormatted = ethBalance
    ? parseFloat(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(4)
    : null

  const canSwap =
    isConnected &&
    isOnEthMainnet &&
    txStep === 'quoted' &&
    !!quote &&
    !isBusy

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <ConnectWallet
            requiredChainId={ETH_MAINNET_CHAIN_ID as 1}
            requiredChainLabel="Ethereum"
            actionLabel="swap tokens"
          />
        </div>

        <div className="rounded-3xl border border-[rgba(20,20,20,0.1)] bg-white p-6 shadow-[0_8px_32px_rgba(20,20,20,0.08)]">
          <h1 className="mb-1 text-xl font-bold text-[var(--color-ink)]">Swap</h1>
          <p className="mb-6 text-xs text-[var(--color-muted)]">ETH → USDC · Ethereum</p>

          {/* Token In */}
          <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(20,20,20,0.02)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
                You Pay
              </span>
              {ethBalanceFormatted && (
                <button
                  onClick={() =>
                    setEthAmount(parseFloat(formatUnits(ethBalance!.value, ethBalance!.decimals)).toFixed(6))
                  }
                  className="text-xs text-[var(--color-cyan)] hover:underline"
                >
                  Max: {ethBalanceFormatted} ETH
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(98,126,234,0.12)] text-lg font-semibold text-[#627eea]">
                Ξ
              </div>
              <input
                type="number"
                min="0"
                step="0.001"
                placeholder="0.0"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                disabled={isBusy || txStep === 'done'}
                className="min-w-0 flex-1 bg-transparent text-xl font-semibold text-[var(--color-ink)] outline-none placeholder:text-[rgba(20,20,20,0.2)] disabled:opacity-60"
              />
              <span className="flex-shrink-0 rounded-full bg-[rgba(20,20,20,0.06)] px-3 py-1 text-sm font-semibold text-[var(--color-ink)]">
                ETH
              </span>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(20,20,20,0.1)] bg-white shadow-sm">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 2v10M3 8l4 4 4-4"
                  stroke="var(--color-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* Token Out */}
          <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(20,20,20,0.02)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
                You Receive
              </span>
              {minUsdcOut && (
                <span className="text-xs text-[var(--color-muted)]">
                  Min: {minUsdcOut} USDC
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(0,82,255,0.1)] text-sm font-bold text-[#0052ff]">
                $
              </div>
              <div className="min-w-0 flex-1 text-xl font-semibold text-[var(--color-ink)]">
                {txStep === 'quoting' ? (
                  <span className="animate-pulse text-[var(--color-muted)]">
                    Fetching quote…
                  </span>
                ) : usdcOut ? (
                  usdcOut
                ) : (
                  <span className="text-[rgba(20,20,20,0.2)]">0.0</span>
                )}
              </div>
              <span className="flex-shrink-0 rounded-full bg-[rgba(0,82,255,0.08)] px-3 py-1 text-sm font-semibold text-[#0052ff]">
                USDC
              </span>
            </div>
          </div>

          {/* Quote Details */}
          {quote && txStep !== 'idle' && txStep !== 'error' && (
            <div className="mt-4 space-y-1.5 rounded-2xl border border-[rgba(20,20,20,0.06)] bg-[rgba(20,20,20,0.015)] p-3">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--color-muted)]">Route</span>
                <span className="font-medium text-[var(--color-ink)]">
                  {routingLabel(quote.routing)}
                </span>
              </div>
              {(quote.quote.gasFeeUSD ?? quote.quote.gasUseEstimateUSD) && (
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--color-muted)]">Network Fee</span>
                  <span className="font-medium text-[var(--color-ink)]">
                    ~${parseFloat(String(quote.quote.gasFeeUSD ?? quote.quote.gasUseEstimateUSD)).toFixed(4)}
                  </span>
                </div>
              )}
              {quote.quote.priceImpact !== undefined && (
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--color-muted)]">Price Impact</span>
                  <span
                    className={`font-medium ${
                      parseFloat(String(quote.quote.priceImpact)) > 1
                        ? 'text-[var(--color-orange)]'
                        : 'text-[var(--color-ink)]'
                    }`}
                  >
                    {parseFloat(String(quote.quote.priceImpact)).toFixed(3)}%
                  </span>
                </div>
              )}
              {quote.permitData && (
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--color-muted)]">Approval</span>
                  <span className="font-medium text-[var(--color-cyan)]">
                    Permit2 (gasless)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="mt-4 rounded-2xl border border-[rgba(255,80,0,0.2)] bg-[rgba(255,80,0,0.04)] p-3 text-xs text-[var(--color-orange)]">
              {errorMsg}
            </div>
          )}

          {/* Success */}
          {txStep === 'done' && (
            <div className="mt-4 rounded-2xl border border-[rgba(0,180,80,0.2)] bg-[rgba(0,180,80,0.04)] p-3">
              <p className="text-xs font-semibold text-green-600">
                {txHash ? 'Swap submitted!' : 'Order submitted (UniswapX gasless)'}
              </p>
              {txHash && (
                <a
                  href={`https://etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-xs text-[var(--color-cyan)] underline"
                >
                  {txHash}
                </a>
              )}
            </div>
          )}

          {/* Network Switch */}
          {isConnected && !isOnEthMainnet && (
            <button
              onClick={() => switchChain({ chainId: ETH_MAINNET_CHAIN_ID })}
              disabled={isSwitching}
              className="mt-5 w-full rounded-full bg-[var(--color-cyan)] py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {isSwitching ? 'Switching…' : 'Switch to Ethereum'}
            </button>
          )}

          {/* Swap Button */}
          {(!isConnected || isOnEthMainnet) && txStep !== 'done' && (
            <button
              onClick={handleSwap}
              disabled={!canSwap}
              className="mt-5 w-full rounded-full bg-[var(--color-cyan)] py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? stepButtonLabel(txStep) : 'Swap'}
            </button>
          )}

          {txStep === 'done' && (
            <button
              onClick={() => {
                setEthAmount('')
                setQuote(null)
                setTxStep('idle')
                setTxHash('')
                setErrorMsg('')
              }}
              className="mt-5 w-full rounded-full border border-[rgba(20,20,20,0.12)] bg-white py-3.5 text-sm font-semibold text-[var(--color-ink)] transition hover:border-[rgba(0,0,255,0.2)] hover:text-[var(--color-cyan)]"
            >
              New Swap
            </button>
          )}

          <p className="mt-4 text-center text-[10px] text-[var(--color-muted)]">
            Ethereum · Powered by Uniswap Trading API
          </p>
        </div>
      </div>
    </div>
  )
}
