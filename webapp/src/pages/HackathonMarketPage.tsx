import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { parseUnits } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts, useSwitchChain, useWriteContract } from 'wagmi'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { getExplorerAddressUrl, MARKET_CHAIN, MARKET_CHAIN_LABEL, SOURCE_CHAIN, SOURCE_CHAIN_LABEL } from '@/config/chains'
import {
  BINARY_MARKET_ABI,
  binaryMarketStatusLabel,
  BinaryMarketStatus,
  BinaryOutcome,
  ERC20_ABI,
  MARKET_USDC_ADDRESS,
  SOURCE_USDC_ADDRESS,
} from '@/config/contracts'
import { getArcBridgeUrl } from '@/lib/bridge'
import { formatUsdc, shortenAddress } from '@/lib/utils'
import { getUniswapSwapUrl } from '@/lib/uniswap'

type Position = {
  player: `0x${string}`
  amount: bigint
}

type TxStep = 'idle' | 'approving' | 'placing' | 'claiming' | 'done' | 'error'

export function HackathonMarketPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient()
  const [outcome, setOutcome] = useState<number>(BinaryOutcome.Yes)
  const [amount, setAmount] = useState('5')
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [livePrice, setLivePrice] = useState<string | null>(null)

  const BOT_API = import.meta.env.VITE_BOT_API_URL ?? 'http://localhost:3000'

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const r = await fetch(`${BOT_API}/api/crude-oil-price`)
        if (!r.ok) return
        const d = await r.json()
        if (active) setLivePrice(typeof d.price === 'string' ? d.price : null)
      } catch { /* ignore */ }
    }
    load()
    const iv = setInterval(load, 120_000)
    return () => { active = false; clearInterval(iv) }
  }, [BOT_API])

  const marketAddress = contractAddress as `0x${string}`
  const isOnMarketChain = chainId === MARKET_CHAIN.id

  const { data: marketInfo, refetch: refetchMarketInfo } = useReadContract({
    address: marketAddress,
    abi: BINARY_MARKET_ABI,
    functionName: 'getMarketInfo',
    chainId: MARKET_CHAIN.id,
  })

  const { data: positions, refetch: refetchPositions } = useReadContracts({
    contracts: [
      { address: marketAddress, abi: BINARY_MARKET_ABI, functionName: 'getYesPositions', chainId: MARKET_CHAIN.id },
      { address: marketAddress, abi: BINARY_MARKET_ABI, functionName: 'getNoPositions', chainId: MARKET_CHAIN.id },
    ],
  })

  const yesPositions = (positions?.[0]?.result as Position[] | undefined) || []
  const noPositions = (positions?.[1]?.result as Position[] | undefined) || []

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: MARKET_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, marketAddress] : undefined,
    chainId: MARKET_CHAIN.id,
    query: { enabled: !!address && MARKET_USDC_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const { data: marketUsdcBalance } = useReadContract({
    address: MARKET_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: MARKET_CHAIN.id,
    query: { enabled: !!address && MARKET_USDC_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const { data: sourceUsdcBalance } = useReadContract({
    address: SOURCE_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: SOURCE_CHAIN.id,
    query: { enabled: !!address && SOURCE_USDC_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const { data: claimableAmount } = useReadContract({
    address: marketAddress,
    abi: BINARY_MARKET_ABI,
    functionName: 'claimable',
    args: address ? [address] : undefined,
    chainId: MARKET_CHAIN.id,
    query: { enabled: !!address },
  })

  const { data: hasClaimed } = useReadContract({
    address: marketAddress,
    abi: BINARY_MARKET_ABI,
    functionName: 'hasClaimed',
    args: address ? [address] : undefined,
    chainId: MARKET_CHAIN.id,
    query: { enabled: !!address },
  })

  const { writeContractAsync: writeApprove } = useWriteContract()
  const { writeContractAsync: writePlacePrediction } = useWriteContract()
  const { writeContractAsync: writeClaim } = useWriteContract()

  const amountUnits = amount ? parseUnits(amount, 6) : 0n
  const needsApproval = allowance !== undefined && allowance < amountUnits
  const hasEnoughArcUsdc = marketUsdcBalance !== undefined && marketUsdcBalance >= amountUnits
  const totalYes = marketInfo?.totalYes ?? 0n
  const totalNo = marketInfo?.totalNo ?? 0n
  const totalPool = totalYes + totalNo
  const isOpen = marketInfo?.status === BinaryMarketStatus.Open
  const isResolved = marketInfo?.status === BinaryMarketStatus.Resolved
  const myYesPosition = yesPositions.find((p) => p.player?.toLowerCase() === address?.toLowerCase())
  const myNoPosition = noPositions.find((p) => p.player?.toLowerCase() === address?.toLowerCase())
  const myPosition = myYesPosition || myNoPosition
  const mySideLabel = myYesPosition ? 'UP' : myNoPosition ? 'DOWN' : null
  const bridgeHref = getArcBridgeUrl(amount)
  const uniswapHref = getUniswapSwapUrl()

  const shareText = useMemo(() => {
    return `WTI crude oil market is live on Arc. Bridge USDC in, choose UP or DOWN, and settle through Chainlink CRE.`
  }, [])

  function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message.slice(0, 180)
    return 'Transaction failed'
  }

  async function handlePlacePrediction() {
    if (!publicClient || !address) return

    if (chainId !== MARKET_CHAIN.id) {
      setTxStep('error')
      setErrorMsg(`Switch to ${MARKET_CHAIN_LABEL} after bridging USDC before joining.`)
      return
    }

    if (needsApproval) {
      try {
        setTxStep('approving')
        const approveTx = await writeApprove({
          address: MARKET_USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [marketAddress, amountUnits],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTx })
        await refetchAllowance()
      } catch (error) {
        setTxStep('error')
        setErrorMsg(getErrorMessage(error))
        return
      }
    }

    try {
      setTxStep('placing')
      const placeTx = await writePlacePrediction({
        address: marketAddress,
        abi: BINARY_MARKET_ABI,
        functionName: 'placePrediction',
        args: [outcome, amountUnits],
      })
      await publicClient.waitForTransactionReceipt({ hash: placeTx })
      setTxStep('done')
      await Promise.all([refetchMarketInfo(), refetchPositions(), refetchAllowance()])
    } catch (error) {
      setTxStep('error')
      setErrorMsg(getErrorMessage(error))
    }
  }

  async function handleClaim() {
    if (!publicClient) return
    try {
      setTxStep('claiming')
      const claimTx = await writeClaim({
        address: marketAddress,
        abi: BINARY_MARKET_ABI,
        functionName: 'claim',
      })
      await publicClient.waitForTransactionReceipt({ hash: claimTx })
      setTxStep('done')
      await refetchMarketInfo()
    } catch (error) {
      setTxStep('error')
      setErrorMsg(getErrorMessage(error))
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,0,255,0.06),transparent_18%)]" />
      <div className="relative mx-auto max-w-6xl px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <Logo />
          <ConnectWallet />
        </header>

        <div className="mt-10 grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Arc Prediction Market</p>
              <h1 className="mt-4 max-w-3xl font-[var(--font-display)] text-2xl font-semibold tracking-[-0.03em] md:text-3xl">
                {'Will crude oil price be higher in 6 hours?'}
              </h1>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Asset</p>
                <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">OIL/USD</p>
              </div>
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Duration</p>
                <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">{marketInfo ? (Number(marketInfo.duration) >= 3600 ? `${(Number(marketInfo.duration) / 3600).toFixed(1).replace('.0', '')}h` : `${Math.round(Number(marketInfo.duration) / 60)}m`) : '6h'}</p>
              </div>
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Live Price</p>
                <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">{livePrice ? `$${Number(livePrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'Loading...'}</p>
                <p className="mt-1 text-[10px] text-[var(--color-muted)]">Powered by Chainlink CRE</p>
              </div>
            </div>

            {marketInfo && (
              <div className="glow-card rounded-[28px] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]">
                    {binaryMarketStatusLabel(marketInfo.status)}
                  </span>
                  {mySideLabel && (
                    <span className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]">
                      You picked {mySideLabel}
                    </span>
                  )}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <MetricCard label="UP Pool" value={`${formatUsdc(totalYes)} USDC`} />
                  <MetricCard label="DOWN Pool" value={`${formatUsdc(totalNo)} USDC`} />
                  <MetricCard label="Total Pool" value={`${formatUsdc(totalPool)} USDC`} />
                </div>

                <div className="mt-6 grid gap-3 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm text-[var(--color-muted)] md:grid-cols-2">
                  <div>Closes: <span className="font-medium text-[var(--color-ink)]">{marketInfo.bettingDeadline > 0n ? new Date(Number(marketInfo.bettingDeadline) * 1000).toLocaleString() : '--'}</span></div>
                  <div>Start time: <span className="font-medium text-[var(--color-ink)]">{marketInfo.startTime > 0n ? new Date(Number(marketInfo.startTime) * 1000).toLocaleString() : 'Waiting for CRE lock'}</span></div>
                  <div>Resolved result: <span className="font-medium text-[var(--color-ink)]">{marketInfo.status === BinaryMarketStatus.Resolved ? (marketInfo.resolvedOutcome === BinaryOutcome.Yes ? '1 = UP' : '0 = DOWN') : 'Pending'}</span></div>
                </div>
              </div>
            )}

            {marketInfo && (yesPositions.length > 0 || noPositions.length > 0) && (
              <div className="glow-card rounded-[28px] p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Participants</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <PositionList title="UP" positions={yesPositions} address={address} />
                  <PositionList title="DOWN" positions={noPositions} address={address} />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="glow-card rounded-[28px] p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Action Panel</p>

              {isConnected && !isOnMarketChain && (
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-cyan)]">Get Arc USDC First</p>
                    <div className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
                      <div className="flex items-center justify-between gap-3">
                        <span>{SOURCE_CHAIN_LABEL} USDC</span>
                        <span className="font-medium text-[var(--color-ink)]">{sourceUsdcBalance !== undefined ? `${formatUsdc(sourceUsdcBalance)} USDC` : '--'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>{MARKET_CHAIN_LABEL} USDC</span>
                        <span className="font-medium text-[var(--color-ink)]">{marketUsdcBalance !== undefined ? `${formatUsdc(marketUsdcBalance)} USDC` : '--'}</span>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white p-4 text-sm text-[var(--color-muted)]">
                      <p>1. If you do not already have USDC, swap into USDC on Uniswap.</p>
                      <p className="mt-2">2. Bridge the USDC to Arc.</p>
                      <p className="mt-2">3. Switch to Arc and place your prediction.</p>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <a href={uniswapHref} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-4 text-center text-sm font-semibold text-[var(--color-ink)]">
                        Swap To USDC On Uniswap
                      </a>
                      <a href={bridgeHref} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[var(--color-cyan)] px-5 py-4 text-center text-sm font-semibold text-white">
                        Bridge USDC To Arc
                      </a>
                      <button onClick={() => switchChain({ chainId: MARKET_CHAIN.id })} className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-5 py-4 text-sm font-semibold text-[var(--color-cyan)]">
                        Switch To {MARKET_CHAIN_LABEL}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isConnected && isOnMarketChain && isOpen && !myPosition && (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setOutcome(BinaryOutcome.Yes)}
                      className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${outcome === BinaryOutcome.Yes ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] ring-1 ring-[rgba(34,197,94,0.4)]' : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'}`}
                    >
                      UP
                    </button>
                    <button
                      onClick={() => setOutcome(BinaryOutcome.No)}
                      className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${outcome === BinaryOutcome.No ? 'bg-[rgba(239,68,68,0.12)] text-[#dc2626] ring-1 ring-[rgba(239,68,68,0.4)]' : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'}`}
                    >
                      DOWN
                    </button>
                  </div>

                  <label className="block text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">
                    Prediction Amount
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white px-4 py-4 text-base text-[var(--color-ink)]"
                    />
                  </label>

                  <button
                    onClick={handlePlacePrediction}
                    disabled={!hasEnoughArcUsdc}
                    className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {needsApproval ? 'Approve USDC and Join' : 'Join Prediction'}
                  </button>

                  {!hasEnoughArcUsdc && (
                    <p className="text-sm text-[var(--color-cyan)]">
                      Insufficient Arc USDC. Bridge from {SOURCE_CHAIN_LABEL} first.
                    </p>
                  )}
                </div>
              )}

              {isConnected && isOnMarketChain && myPosition && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4">
                  <p className="text-sm text-[var(--color-ink)]">You already joined on the {mySideLabel} side.</p>
                </div>
              )}

              {isConnected && isOnMarketChain && isResolved && claimableAmount && claimableAmount > 0n && !hasClaimed && (
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-cyan)]">Claimable</p>
                    <p className="mt-3 text-2xl font-semibold">{formatUsdc(claimableAmount)} USDC</p>
                  </div>
                  <button onClick={handleClaim} className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white">
                    Claim Payout
                  </button>
                </div>
              )}

              {!isConnected && (
                <div className="mt-5 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                  <p className="text-sm text-[var(--color-muted)]">Connect a wallet to join or claim from this market.</p>
                </div>
              )}

              {txStep !== 'idle' && txStep !== 'done' && txStep !== 'error' && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                  {txStep === 'approving' && 'Waiting for Arc USDC approval confirmation...'}
                  {txStep === 'placing' && 'Waiting for prediction confirmation...'}
                  {txStep === 'claiming' && 'Waiting for claim confirmation...'}
                </div>
              )}

              {txStep === 'done' && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                  Transaction completed.
                </div>
              )}

              {txStep === 'error' && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                  {errorMsg}
                </div>
              )}
            </div>

            <div className="glow-card rounded-[28px] p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Demo Links</p>
              <div className="mt-4 grid gap-3">
                <a href={getExplorerAddressUrl(marketAddress, MARKET_CHAIN.id)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-4 text-center text-sm font-semibold text-[var(--color-ink)]">
                  View On Explorer
                </a>
                <a
                  href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}%20${encodeURIComponent(window.location.href)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-5 py-4 text-center text-sm font-semibold text-[var(--color-cyan)]"
                >
                  Share On X
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">{label}</p>
      <p className="mt-3 text-xl font-semibold text-[var(--color-cyan)]">{value}</p>
    </div>
  )
}

function PositionList({
  title,
  positions,
  address,
}: {
  title: string
  positions: Position[]
  address?: string
}) {
  return (
    <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]">{title}</p>
      <div className="mt-4 space-y-3">
        {positions.length === 0 && <p className="text-sm text-[var(--color-muted)]">No positions yet.</p>}
        {positions.map((position, index) => (
          <div key={`${title}-${index}`} className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-ink)]">
              {shortenAddress(position.player)}
              {position.player?.toLowerCase() === address?.toLowerCase() && <span className="text-[var(--color-muted)]"> (you)</span>}
            </span>
            <span className="text-[var(--color-cyan)]">{formatUsdc(position.amount)} USDC</span>
          </div>
        ))}
      </div>
    </div>
  )
}
