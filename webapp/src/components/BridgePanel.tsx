import { useState } from 'react'
import { useAccount, useBalance, useReadContract, useSwitchChain } from 'wagmi'
import { formatUnits } from 'viem'
import { MARKET_CHAIN, MARKET_CHAIN_LABEL, SOURCE_CHAIN, BRIDGE_CHAIN, BRIDGE_CHAIN_LABEL } from '@/config/chains'
import { ERC20_ABI, MARKET_USDC_ADDRESS, BRIDGE_SOURCE_USDC_ADDRESS } from '@/config/contracts'
import { formatUsdc } from '@/lib/utils'
import { useBridgeUSDC } from '@/hooks/useBridgeUSDC'
import { useUniswapSwap, SWAP_TOKENS } from '@/hooks/useUniswapSwap'

interface BridgePanelProps {
  amount?: string
  onBridged?: () => void
}

export function BridgePanel({ amount, onBridged }: BridgePanelProps) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const { step, txHash, errorMsg, bridge, reset } = useBridgeUSDC()

  const { data: ethBalance } = useBalance({ address, chainId: SOURCE_CHAIN.id })  // mainnet ETH for swap
  const maxEth = ethBalance ? parseFloat(formatUnits(ethBalance.value, ethBalance.decimals)) : 1

  const [bridgeAmount, setBridgeAmount] = useState(amount ?? '50')
  const [swapAmount, setSwapAmount] = useState('0.01')
  const selectedToken = SWAP_TOKENS[0]

  const swap = useUniswapSwap()

  const isOnArc = chainId === MARKET_CHAIN.id
  const isOnBridgeChain = chainId === BRIDGE_CHAIN.id

  const { data: bridgeUsdcBalance } = useReadContract({
    address: BRIDGE_SOURCE_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: BRIDGE_CHAIN.id,
    query: { enabled: !!address && BRIDGE_SOURCE_USDC_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const { data: arcUsdcBalance, refetch: refetchArcBalance } = useReadContract({
    address: MARKET_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: MARKET_CHAIN.id,
    query: { enabled: !!address && MARKET_USDC_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  function handleSwapAmountChange(val: string) {
    setSwapAmount(val)
    swap.getQuote(selectedToken, val)
  }

  async function handleBridge() {
    try {
      if (!isOnBridgeChain) await switchChain({ chainId: BRIDGE_CHAIN.id })
      await bridge(bridgeAmount)
      await refetchArcBalance()
      onBridged?.()
    } catch {
      // user rejected chain switch — bridge() sets its own error state
    }
  }

  function getBridgeBtnLabel(): string {
    if (step === 'processing') return 'Bridging… sign wallet prompts'
    if (step === 'error') return 'Retry Bridge'
    return isOnBridgeChain ? 'Bridge USDC to Arc' : `Bridge USDC to Arc`
  }

  return (
    <div className="rounded-[24px] border border-[rgba(0,0,255,0.14)] bg-[rgba(0,0,255,0.04)] p-5">
      <p className="text-xs uppercase tracking-[0.26em] text-[var(--color-cyan)]">Get USDC on Arc</p>
      <p className="mt-1 text-[10px] text-[var(--color-muted)]">Step 1: Swap on Ethereum · Step 2: Bridge from Base Sepolia · Step 3: Play on Arc</p>

      {/* Balances */}
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm">
        <div>
          <p className="text-xs text-[var(--color-muted)]">{BRIDGE_CHAIN_LABEL} USDC</p>
          <p className="mt-1 font-semibold text-[var(--color-ink)]">
            {bridgeUsdcBalance !== undefined ? formatUsdc(bridgeUsdcBalance) : '--'}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted)]">{MARKET_CHAIN_LABEL} USDC</p>
          <p className="mt-1 font-semibold text-[var(--color-ink)]">
            {arcUsdcBalance !== undefined ? formatUsdc(arcUsdcBalance) : '--'}
          </p>
        </div>
      </div>

      {/* Step 1: Swap to USDC via Uniswap Trading API */}
      <div className="mt-5">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(0,0,255,0.08)] text-[10px] font-bold text-[var(--color-cyan)]">1</span>
          <p className="text-sm font-medium text-[var(--color-ink)]">Swap {selectedToken.symbol} → USDC on Ethereum</p>
        </div>

        {swap.step !== 'done' ? (
          <div className="mt-3 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white p-4 space-y-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">Powered by Uniswap Trading API</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="rounded-xl border border-[rgba(20,20,20,0.08)] bg-[rgba(0,0,0,0.02)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink)]">
                  {selectedToken.symbol}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-semibold text-[var(--color-ink)]">{swapAmount}</span>
                  <span className="text-sm text-[var(--color-muted)]">{selectedToken.symbol}</span>
                  <span className="text-sm text-[var(--color-muted)]">→ USDC</span>
                </div>
                {ethBalance && (
                  <button
                    onClick={() => handleSwapAmountChange(maxEth.toFixed(4))}
                    className="text-[10px] text-[var(--color-cyan)] hover:underline"
                  >
                    Max
                  </button>
                )}
              </div>
              <input
                type="range"
                min="0.001"
                max={maxEth > 0.001 ? maxEth.toFixed(4) : '1'}
                step="0.001"
                value={swapAmount}
                onChange={(e) => handleSwapAmountChange(e.target.value)}
                disabled={swap.step === 'swapping'}
                className="w-full accent-[var(--color-cyan)] disabled:opacity-50"
              />
              <div className="flex justify-between text-[10px] text-[var(--color-muted)]">
                <span>0.001</span>
                <span>{ethBalance ? maxEth.toFixed(4) : '--'} ETH</span>
              </div>
            </div>

            {swap.step === 'quoting' && (
              <p className="text-xs text-[var(--color-muted)]">Getting best route…</p>
            )}
            {swap.hasQuote && (
              <div className="rounded-xl bg-[rgba(0,0,255,0.04)] px-3 py-2 text-xs space-y-1">
                <p className="font-semibold text-[var(--color-ink)]">You receive: ~{Number(swap.quoteOut).toFixed(2)} USDC</p>
                {swap.priceImpact && <p className="text-[var(--color-muted)]">Price impact: {swap.priceImpact}%</p>}
                {swap.gasUSD && <p className="text-[var(--color-muted)]">Est. gas: ~${swap.gasUSD}</p>}
              </div>
            )}

            <button
              onClick={swap.executeSwap}
              disabled={!swap.hasQuote || swap.step === 'swapping' || swap.step === 'quoting'}
              className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {swap.step === 'swapping' ? 'Swapping…' : swap.step === 'quoting' ? 'Quoting…' : 'Swap to USDC'}
            </button>

            {swap.step === 'error' && (
              <p className="text-xs text-red-600">{swap.errorMsg}</p>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.06)] p-3">
            <p className="text-sm font-semibold text-[#15803d]">Swapped to USDC ✓</p>
            {swap.txHash && <p className="mt-1 break-all text-xs text-[var(--color-muted)]">Tx: {swap.txHash}</p>}
            <button onClick={swap.reset} className="mt-2 text-xs text-[var(--color-cyan)] underline">Swap again</button>
          </div>
        )}
      </div>

      {/* Step 2: Bridge to Arc */}
      <div className="mt-5">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(0,0,255,0.08)] text-[10px] font-bold text-[var(--color-cyan)]">2</span>
          <p className="text-sm font-medium text-[var(--color-ink)]">Bridge USDC to Arc via Circle CCTP</p>
        </div>

        {step !== 'done' ? (
          <div className="mt-3 space-y-2">
            <label className="block text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">
              Amount (USDC)
              <input
                value={bridgeAmount}
                onChange={(e) => setBridgeAmount(e.target.value)}
                disabled={step === 'processing'}
                className="mt-2 w-full rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white px-4 py-3 text-base text-[var(--color-ink)] disabled:opacity-50"
              />
            </label>
            <button
              onClick={handleBridge}
              disabled={step === 'processing'}
              className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {getBridgeBtnLabel()}
            </button>
            {step === 'error' && (
              <div className="rounded-2xl bg-[rgba(239,68,68,0.08)] p-3 text-xs text-red-600">
                {errorMsg}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.06)] p-4">
              <p className="text-sm font-semibold text-[#15803d]">USDC bridged to Arc ✓</p>
              {txHash && <p className="mt-1 break-all text-xs text-[var(--color-muted)]">Tx: {txHash}</p>}
            </div>
            <button
              onClick={reset}
              className="w-full rounded-full border border-[rgba(20,20,20,0.12)] bg-white px-5 py-3 text-sm font-semibold text-[var(--color-muted)]"
            >
              Bridge more
            </button>
          </div>
        )}
      </div>

      {/* Step 3: Switch to Arc */}
      <div className="mt-5">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(0,0,255,0.08)] text-[10px] font-bold text-[var(--color-cyan)]">3</span>
          <p className="text-sm font-medium text-[var(--color-ink)]">Switch to {MARKET_CHAIN_LABEL} and bet</p>
        </div>
        {!isOnArc && (
          <button
            onClick={() => switchChain({ chainId: MARKET_CHAIN.id })}
            className="mt-3 w-full rounded-full border border-[rgba(0,0,255,0.16)] bg-transparent px-5 py-3 text-sm font-semibold text-[var(--color-cyan)]"
          >
            Switch to {MARKET_CHAIN_LABEL}
          </button>
        )}
        {isOnArc && (
          <p className="mt-2 text-sm text-[#15803d]">✓ Connected to {MARKET_CHAIN_LABEL}</p>
        )}
      </div>
    </div>
  )
}
