import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { parseUnits } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts, useSwitchChain, useWriteContract } from 'wagmi'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { getExplorerAddressUrl, MARKET_CHAIN, MARKET_CHAIN_LABEL, SOURCE_CHAIN, SOURCE_CHAIN_LABEL } from '@/config/chains'
import { BET_ABI, BetStatus, betStatusLabel, ERC20_ABI, MARKET_USDC_ADDRESS, SOURCE_USDC_ADDRESS, Side } from '@/config/contracts'
import { getArcBridgeUrl, hasArcBridgeUrl } from '@/lib/bridge'
import { formatPrice, formatUsdc, shareOnXUrl, shortenAddress } from '@/lib/utils'

type TxStep = 'idle' | 'approving' | 'placing' | 'placed' | 'claiming' | 'claimed' | 'error'
const BOT_API_URL = import.meta.env.VITE_BOT_API_URL || ''

type Position = {
  player: `0x${string}`
  amount: bigint
}

type OracleRecord = {
  asset: string
  oracleAddress: string
}

export function BetPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const [searchParams] = useSearchParams()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient()
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [asset, setAsset] = useState<string | null>(null)
  const [livePrice, setLivePrice] = useState<string | null>(null)
  const [side, setSide] = useState<number>(searchParams.get('side') === 'down' ? Side.Down : Side.Up)
  const [amount, setAmount] = useState('50')

  const betAddr = contractAddress as `0x${string}`

  const { data: betInfo, refetch: refetchBetInfo } = useReadContract({
    address: betAddr,
    abi: BET_ABI,
    functionName: 'getBetInfo',
    chainId: MARKET_CHAIN.id,
  })

  const { data: positionData, refetch: refetchPositions } = useReadContracts({
    contracts: [
      { address: betAddr, abi: BET_ABI, functionName: 'getUpPositions', chainId: MARKET_CHAIN.id },
      { address: betAddr, abi: BET_ABI, functionName: 'getDownPositions', chainId: MARKET_CHAIN.id },
    ],
  })

  const upPositions = (positionData?.[0]?.result as Position[] | undefined) || []
  const downPositions = (positionData?.[1]?.result as Position[] | undefined) || []

  const { data: claimableAmount } = useReadContract({
    address: betAddr,
    abi: BET_ABI,
    functionName: 'claimable',
    args: address ? [address] : undefined,
    chainId: MARKET_CHAIN.id,
    query: { enabled: !!address && betInfo?.status === BetStatus.Settled },
  })

  const { data: hasClaimed } = useReadContract({
    address: betAddr,
    abi: BET_ABI,
    functionName: 'hasClaimed',
    args: address ? [address] : undefined,
    chainId: MARKET_CHAIN.id,
    query: { enabled: !!address },
  })

  const myPosition = [...upPositions, ...downPositions].find((p) => p.player?.toLowerCase() === address?.toLowerCase())
  const myUpPosition = upPositions.find((p) => p.player?.toLowerCase() === address?.toLowerCase())
  const mySide = myUpPosition ? 'UP' : myPosition ? 'DOWN' : null
  const totalPlayers = upPositions.length + downPositions.length
  const solePosition = totalPlayers === 1 ? (upPositions[0] || downPositions[0]) : null
  const initiatorSide = totalPlayers === 1 ? (upPositions.length === 1 ? Side.Up : Side.Down) : null
  const initiatorAmount = solePosition?.amount ?? 0n
  const isSecondBettorTurn = totalPlayers === 1 && !myPosition
  const requiredSecondSide = initiatorSide === Side.Up ? Side.Down : initiatorSide === Side.Down ? Side.Up : null

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: MARKET_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, betAddr] : undefined,
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

  const { writeContractAsync: writeApprove } = useWriteContract()
  const { writeContractAsync: writePlaceBet } = useWriteContract()
  const { writeContractAsync: writeClaim } = useWriteContract()

  const betStatus = betInfo?.status ?? 0
  const totalUp = betInfo?.totalUp ?? 0n
  const totalDown = betInfo?.totalDown ?? 0n
  const totalPool = totalUp + totalDown
  const minAmount = betInfo?.minAmount ?? 0n
  const maxAmount = betInfo?.maxAmount ?? 0n
  const duration = betInfo?.duration ? Number(betInfo.duration) : 0
  const isOpen = betStatus === BetStatus.Open
  const isSettled = betStatus === BetStatus.Settled
  const bettingDeadline = betInfo?.bettingDeadline ? Number(betInfo.bettingDeadline) : 0
  const endTime = betInfo?.endTime ? Number(betInfo.endTime) : 0
  const now = Math.floor(Date.now() / 1000)
  const bettingOpen = isOpen && bettingDeadline > now
  const estimatedSettlementTime = endTime > 0 ? endTime : bettingDeadline > 0 && duration > 0 ? bettingDeadline + duration : 0
  const minSelectableAmount = initiatorAmount > minAmount ? initiatorAmount : minAmount
  const maxSelectableAmount = maxAmount > 0n
    ? (maxAmount >= minSelectableAmount ? maxAmount : minSelectableAmount)
    : (marketUsdcBalance !== undefined && marketUsdcBalance >= minSelectableAmount ? marketUsdcBalance : minSelectableAmount)
  const minSliderValue = Number(minSelectableAmount / 1_000_000n)
  const maxSliderValue = Number(maxSelectableAmount / 1_000_000n)
  const usdcAmount = amount ? parseUnits(amount, 6) : 0n
  const needsApproval = allowance !== undefined && allowance < usdcAmount
  const hasEnoughBalance = marketUsdcBalance !== undefined && marketUsdcBalance >= usdcAmount
  const secondSideValid = !isSecondBettorTurn || requiredSecondSide === null || side === requiredSecondSide
  const secondAmountValid = !isSecondBettorTurn || usdcAmount >= initiatorAmount
  const sliderRangeValid = maxSelectableAmount >= minSelectableAmount
  const amountWithinRange = usdcAmount >= minSelectableAmount && usdcAmount <= maxSelectableAmount
  const placeBetBlocked = !hasEnoughBalance || !secondSideValid || !secondAmountValid || !sliderRangeValid || !amountWithinRange
  const secondBetDirectionLabel = requiredSecondSide === Side.Up ? 'UP' : requiredSecondSide === Side.Down ? 'DOWN' : null
  const isOnMarketChain = chainId === MARKET_CHAIN.id
  const isOnSourceChain = chainId === SOURCE_CHAIN.id
  const requiresBridge = isConnected && !isOnMarketChain
  const marketUsdcLabel = marketUsdcBalance !== undefined ? `${formatUsdc(marketUsdcBalance)} USDC` : '--'
  const sourceUsdcLabel = sourceUsdcBalance !== undefined ? `${formatUsdc(sourceUsdcBalance)} USDC` : '--'
  const bridgeHref = getArcBridgeUrl(amount)

  useEffect(() => {
    if (!betInfo || minSliderValue <= 0 || maxSliderValue <= 0) return
    const currentValue = Number(amount)
    if (!Number.isFinite(currentValue)) {
      setAmount(String(minSliderValue))
      return
    }
    const clamped = Math.min(Math.max(currentValue, minSliderValue), maxSliderValue)
    if (clamped !== currentValue) {
      setAmount(String(clamped))
    }
  }, [betInfo, amount, minSliderValue, maxSliderValue])

  useEffect(() => {
    if (!isSecondBettorTurn || requiredSecondSide === null) return
    if (side !== requiredSecondSide) {
      setSide(requiredSecondSide)
    }
  }, [isSecondBettorTurn, requiredSecondSide, side])

  useEffect(() => {
    if (!betInfo?.priceFeed) return

    let active = true
    const priceFeed = String(betInfo.priceFeed).toLowerCase()

    const loadAsset = async () => {
      try {
        const response = await fetch(`${BOT_API_URL}/api/oracles`, {
          headers: { 'ngrok-skip-browser-warning': 'true' },
        })
        if (!response.ok) throw new Error('Failed to load oracle list')
        const data = await response.json() as OracleRecord[]
        if (!active) return
        const matched = data.find((oracle) => oracle.oracleAddress?.toLowerCase() === priceFeed)
        setAsset(matched?.asset || null)
      } catch {
        if (active) {
          setAsset(null)
        }
      }
    }

    loadAsset()

    return () => {
      active = false
    }
  }, [betInfo?.priceFeed])

  useEffect(() => {
    if (!asset) return

    let active = true

    const loadPrice = async () => {
      try {
        const response = await fetch(`${BOT_API_URL}/api/price/${encodeURIComponent(asset)}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' },
        })
        if (!response.ok) throw new Error('Failed to load live price')
        const data = await response.json()
        if (active) {
          setLivePrice(typeof data?.price === 'string' ? data.price : null)
        }
      } catch {
        if (active) {
          setLivePrice(null)
        }
      }
    }

    loadPrice()
    const interval = setInterval(loadPrice, 1500)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [asset])

  function formatLivePrice(value: string | null) {
    if (!value) return 'Loading...'
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return value
    return `$${numeric.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
  }

  const shareUrl = useMemo(() => {
    if (!contractAddress || !window?.location?.origin) return ''
    return `${window.location.origin}/share/${contractAddress}`
  }, [contractAddress])

  function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message.slice(0, 180)
    return 'Transaction failed'
  }

  async function handlePlaceBet() {
    if (!amount || !address || !publicClient) return
    setErrorMsg('')
    if (chainId !== MARKET_CHAIN.id) {
      setTxStep('error')
      setErrorMsg(`Switch to ${MARKET_CHAIN_LABEL} after bridging USDC before joining this market.`)
      return
    }
    if (MARKET_USDC_ADDRESS === '0x0000000000000000000000000000000000000000') {
      setTxStep('error')
      setErrorMsg('Market USDC address is not configured. Set VITE_MARKET_USDC_ADDRESS for Arc deployment.')
      return
    }
    if (!secondSideValid) {
      setTxStep('error')
      setErrorMsg(`The second participant must choose ${secondBetDirectionLabel}.`)
      return
    }
    if (!secondAmountValid) {
      setTxStep('error')
      setErrorMsg(`The second participant must contribute at least ${formatUsdc(initiatorAmount)} USDC.`)
      return
    }

    try {
      if (needsApproval) {
        setTxStep('approving')
        const approveTxHash = await writeApprove({
          address: MARKET_USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [betAddr, usdcAmount],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash })
        await refetchAllowance()
      }

      setTxStep('placing')
      const placeTxHash = await writePlaceBet({
        address: betAddr,
        abi: BET_ABI,
        functionName: 'placeBet',
        args: [side, usdcAmount],
      })
      await publicClient.waitForTransactionReceipt({ hash: placeTxHash })

      setTxStep('placed')
      await Promise.all([refetchBetInfo(), refetchPositions(), refetchAllowance()])
    } catch (error) {
      setTxStep('error')
      setErrorMsg(getErrorMessage(error))
    }
  }

  async function handleClaim() {
    if (!publicClient) return
    setErrorMsg('')
    try {
      setTxStep('claiming')
      const claimTxHash = await writeClaim({
        address: betAddr,
        abi: BET_ABI,
        functionName: 'claim',
      })
      await publicClient.waitForTransactionReceipt({ hash: claimTxHash })
      setTxStep('claimed')
      await refetchBetInfo()
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
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Prediction Market</p>
              <h1 className={`mt-4 font-semibold tracking-tight ${isSettled ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl'}`}>
                {isSettled ? 'Market settled. Review the final outcome.' : 'Choose a side. Size your conviction.'}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
                {isSettled
                  ? 'This market has been finalized using on-chain oracle prices. You can review the result and claim if eligible.'
                  : 'This Arc market settles in USDC. Bridge to Arc first if your capital starts on Base, then approve and join on Arc.'}
              </p>
            </div>

            {betInfo && (
              <div className="glow-card rounded-[28px] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]">
                    {betStatusLabel(betStatus)}
                  </span>
                  {mySide && (
                    <span className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]">
                      You are on {mySide}
                    </span>
                  )}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <MetricCard label="UP Pool" value={`${formatUsdc(totalUp)} USDC`} accent="cyan" />
                  <MetricCard label="DOWN Pool" value={`${formatUsdc(totalDown)} USDC`} accent="magenta" />
                  <MetricCard label="Total Pool" value={`${formatUsdc(totalPool)} USDC`} accent="green" />
                </div>

              </div>
            )}

            {betInfo && (upPositions.length > 0 || downPositions.length > 0) && (
              <div className="glow-card rounded-[28px] p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Participants</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <PositionList title="UP" positions={upPositions} address={address} accent="cyan" />
                  <PositionList title="DOWN" positions={downPositions} address={address} accent="magenta" />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-6">
            {!isSettled && (
              <div className="glow-card rounded-[28px] p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Action Panel</p>

              {isConnected && requiresBridge && (
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-cyan)]">Bridge To Arc</p>
                    <p className="mt-3 text-sm text-[var(--color-ink)]">
                      This market lives on {MARKET_CHAIN_LABEL}. Your wallet is currently on {isOnSourceChain ? SOURCE_CHAIN_LABEL : 'another network'}.
                    </p>
                    <div className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
                      <div className="flex items-center justify-between gap-3">
                        <span>{SOURCE_CHAIN_LABEL} USDC</span>
                        <span className="font-medium text-[var(--color-ink)]">{sourceUsdcLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>{MARKET_CHAIN_LABEL} USDC</span>
                        <span className="font-medium text-[var(--color-ink)]">{marketUsdcLabel}</span>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white p-4 text-sm text-[var(--color-muted)]">
                      <p>1. Bridge USDC from {SOURCE_CHAIN_LABEL} to {MARKET_CHAIN_LABEL}.</p>
                      <p className="mt-2">2. Wait for your Arc balance to update.</p>
                      <p className="mt-2">3. Switch to {MARKET_CHAIN_LABEL}, then approve and join.</p>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <a
                        href={bridgeHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-[var(--color-cyan)] px-5 py-4 text-center text-sm font-semibold text-white"
                      >
                        {hasArcBridgeUrl() ? `Open ${MARKET_CHAIN_LABEL} Bridge Flow` : 'Open Arc Bridge Setup Guide'}
                      </a>
                      <button
                        onClick={() => switchChain({ chainId: MARKET_CHAIN.id })}
                        className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-4 text-sm font-semibold text-[var(--color-ink)]"
                      >
                        Switch To {MARKET_CHAIN_LABEL}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isConnected && isOnMarketChain && betInfo && bettingOpen && !myPosition && txStep === 'idle' && (
                <div className="mt-5 space-y-4">
                  {isSecondBettorTurn && secondBetDirectionLabel && (
                    <div className="rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                      This is the second prediction entry. You must choose <span className="font-semibold">{secondBetDirectionLabel}</span> and contribute at least <span className="font-semibold">{formatUsdc(initiatorAmount)} USDC</span>.
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSide(Side.Up)}
                      disabled={isSecondBettorTurn && requiredSecondSide === Side.Down}
                      className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${side === Side.Up ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] ring-1 ring-[rgba(34,197,94,0.4)]' : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      UP
                    </button>
                    <button
                      onClick={() => setSide(Side.Down)}
                      disabled={isSecondBettorTurn && requiredSecondSide === Side.Up}
                      className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${side === Side.Down ? 'bg-[rgba(239,68,68,0.12)] text-[#dc2626] ring-1 ring-[rgba(239,68,68,0.4)]' : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      DOWN
                    </button>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Prediction Amount</label>
                    <div className="mt-2 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                      <div className="flex items-end justify-between gap-3">
                        <span className="text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">Selected</span>
                        <span className="text-2xl font-semibold text-[var(--color-ink)]">{amount} USDC</span>
                      </div>
                      <input
                        type="range"
                        min={minSliderValue}
                        max={maxSliderValue}
                        step={1}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-[rgba(0,0,255,0.12)] accent-[var(--color-cyan)]"
                      />
                      <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        <span>{minSliderValue} USDC</span>
                        <span>{maxSliderValue} USDC</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handlePlaceBet}
                    disabled={placeBetBlocked || !isOnMarketChain}
                    className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {needsApproval ? 'Approve USDC and Join Prediction' : 'Join Prediction'}
                  </button>
                  {!hasEnoughBalance && <p className="text-sm text-[var(--color-cyan)]">Insufficient USDC balance for this prediction amount.</p>}
                  {!sliderRangeValid && <p className="text-sm text-[var(--color-cyan)]">This market currently has no valid amount range to join.</p>}
                  {isSecondBettorTurn && !secondAmountValid && (
                    <p className="text-sm text-[var(--color-cyan)]">
                      The second participant must contribute at least {formatUsdc(initiatorAmount)} USDC.
                    </p>
                  )}
                </div>
              )}

              {isConnected && isOnMarketChain && myPosition && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4">
                  <p className="text-sm text-[var(--color-ink)]">You already joined this market on the {mySide} side.</p>
                </div>
              )}

              {isConnected && isOnMarketChain && isSettled && claimableAmount && claimableAmount > 0n && !hasClaimed && (
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-cyan)]">Claimable</p>
                    <p className="mt-3 text-2xl font-semibold">{formatUsdc(claimableAmount)} USDC</p>
                  </div>
                  <button
                    onClick={handleClaim}
                    className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white"
                  >
                    Claim Payout
                  </button>
                </div>
              )}

              {!isConnected && (
                <div className="mt-5 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                  <p className="text-sm text-[var(--color-muted)]">Connect a wallet to join or claim from this market.</p>
                </div>
              )}

              {txStep !== 'idle' && txStep !== 'placed' && txStep !== 'claimed' && txStep !== 'error' && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                  {txStep === 'approving' && 'Waiting for USDC approval confirmation...'}
                  {txStep === 'placing' && 'Waiting for prediction confirmation...'}
                  {txStep === 'claiming' && 'Waiting for claim confirmation...'}
                </div>
              )}

              {(txStep === 'placed' || txStep === 'claimed') && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                  {txStep === 'placed' ? 'Prediction joined successfully.' : 'Claim completed successfully.'}
                </div>
              )}

              {txStep === 'error' && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                  {errorMsg}
                </div>
              )}
              </div>
            )}

            {!isSettled && (
              <div className="glow-card rounded-[28px] p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Share Back To X</p>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                  Post this link back to X so the bot flow can attract more participants.
                </p>
                <div className="mt-4 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                  <p className="break-all text-sm text-[var(--color-ink)]">{shareUrl || window.location.href}</p>
                </div>
                <div className="mt-4 grid gap-3">
                  <a
                    href={getExplorerAddressUrl(contractAddress!, MARKET_CHAIN.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-4 text-center text-sm font-semibold text-[var(--color-ink)]"
                  >
                    View on Scan
                  </a>
                  <a
                    href={shareOnXUrl('Join this live USDC prediction market on Arc.', shareUrl || window.location.href)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-5 py-4 text-center text-sm font-semibold text-[var(--color-cyan)]"
                  >
                    Post on X
                  </a>
                </div>
              </div>
            )}

            {isSettled && betInfo && (
              <div className="glow-card rounded-[28px] p-6 space-y-3">
                <div className="rounded-3xl border border-[rgba(0,82,255,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,247,255,0.95))] p-4 text-sm text-[var(--color-muted)] md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-2">
                  <div>Asset: <span className="font-medium text-[var(--color-ink)]">{asset || '...'}</span></div>
                  <div>
                    Live price: <span className="font-medium text-[var(--color-ink)]">{formatLivePrice(livePrice)}</span>
                  </div>
                  {bettingDeadline > 0 && <div>Start time: <span className="font-medium text-[var(--color-ink)]">{new Date(bettingDeadline * 1000).toLocaleString()}</span></div>}
                  {estimatedSettlementTime > 0 && (
                    <div>
                      {endTime > 0 ? 'Settlement time' : 'Estimated settlement time'}:{' '}
                      <span className="font-medium text-[var(--color-ink)]">{new Date(estimatedSettlementTime * 1000).toLocaleString()}</span>
                    </div>
                  )}
                  {betInfo.startPrice > 0n && <div>Start price: <span className="font-medium text-[var(--color-ink)]">${formatPrice(betInfo.startPrice)}</span></div>}
                  {betInfo.endPrice > 0n && <div>End price: <span className="font-medium text-[var(--color-ink)]">${formatPrice(betInfo.endPrice)}</span></div>}
                </div>

                <div className="rounded-2xl border border-[rgba(0,82,255,0.2)] bg-[rgba(255,255,255,0.98)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-cyan)]">Settled</p>
                  <p className="mt-2 text-base font-semibold text-[var(--color-cyan)]">
                    {betInfo.isDraw ? 'Draw. All participants can reclaim their original contribution.' : `${betInfo.winningSide === Side.Up ? 'UP' : 'DOWN'} won this prediction market.`}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {isSettled && (
        <div className="fixed bottom-4 right-4 z-30 w-[min(92vw,320px)] rounded-2xl border border-[rgba(0,82,255,0.18)] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_14px_34px_rgba(20,20,20,0.16)] backdrop-blur-sm">
          <div className="grid gap-2">
            <a
              href={getExplorerAddressUrl(contractAddress!, MARKET_CHAIN.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-4 py-3 text-center text-sm font-semibold text-[var(--color-ink)]"
            >
              View on Scan
            </a>
            <a
              href={shareOnXUrl('Join this live USDC prediction market on Arc.', shareUrl || window.location.href)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-4 py-3 text-center text-sm font-semibold text-[var(--color-cyan)]"
            >
              Post on X
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: 'cyan' | 'magenta' | 'green' }) {
  const accentMap = {
    cyan: 'bg-[rgba(0,0,255,0.05)] text-[var(--color-cyan)]',
    magenta: 'bg-[rgba(0,0,255,0.05)] text-[var(--color-cyan)]',
    green: 'bg-[rgba(0,0,255,0.05)] text-[var(--color-cyan)]',
  }
  return (
    <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">{label}</p>
      <p className={`mt-3 text-xl font-semibold ${accentMap[accent]}`}>{value}</p>
    </div>
  )
}

function PositionList({
  title,
  positions,
  address,
  accent,
}: {
  title: string
  positions: Position[]
  address?: string
  accent: 'cyan' | 'magenta'
}) {
  const titleClass = accent === 'cyan' ? 'text-[var(--color-cyan)]' : 'text-[var(--color-cyan)]'
  const valueClass = accent === 'cyan' ? 'text-[var(--color-cyan)]' : 'text-[var(--color-cyan)]'
  return (
    <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
      <p className={`text-xs uppercase tracking-[0.24em] ${titleClass}`}>{title}</p>
      <div className="mt-4 space-y-3">
        {positions.length === 0 && <p className="text-sm text-[var(--color-muted)]">No positions yet.</p>}
        {positions.map((p, index: number) => (
          <div key={`${title}-${index}`} className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-ink)]">
              {shortenAddress(p.player)}
              {p.player?.toLowerCase() === address?.toLowerCase() && <span className="text-[var(--color-muted)]"> (you)</span>}
            </span>
            <span className={valueClass}>{formatUsdc(p.amount)} USDC</span>
          </div>
        ))}
      </div>
    </div>
  )
}
