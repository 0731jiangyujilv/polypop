import { useMemo, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { parseUnits } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts, useSwitchChain, useWriteContract } from 'wagmi'
import { BridgePanel } from '@/components/BridgePanel'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { getExplorerAddressUrl, MARKET_CHAIN, MARKET_CHAIN_LABEL } from '@/config/chains'
import {
  BINARY_MARKET_ABI,
  binaryMarketStatusLabel,
  BinaryMarketStatus,
  BinaryOutcome,
  ERC20_ABI,
  MARKET_USDC_ADDRESS,
} from '@/config/contracts'
import { formatUsdc, shortenAddress } from '@/lib/utils'

type Position = {
  player: `0x${string}`
  amount: bigint
}

type TxStep = 'idle' | 'approving' | 'placing' | 'claiming' | 'done' | 'error'

export function MarketPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient()
  const [outcome, setOutcome] = useState<number>(BinaryOutcome.Yes)
  const [amount, setAmount] = useState('10')
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [privacyMode, setPrivacyMode] = useState(false)

  const BOT_API = import.meta.env.VITE_BOT_API_URL ?? 'http://localhost:3000'

  useEffect(() => {
    if (!address) { setPrivacyMode(false); return }
    fetch(`${BOT_API}/api/user/privacy/${address}`)
      .then(r => r.json())
      .then((d: { privacyMode: boolean }) => setPrivacyMode(d.privacyMode))
      .catch(() => {})
  }, [address, BOT_API])

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

  const { data: arcUsdcBalance, refetch: refetchArcBalance } = useReadContract({
    address: MARKET_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: MARKET_CHAIN.id,
    query: { enabled: !!address && MARKET_USDC_ADDRESS !== '0x0000000000000000000000000000000000000000' },
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
  const hasEnoughArcUsdc = arcUsdcBalance !== undefined && arcUsdcBalance >= amountUnits
  const totalYes = marketInfo?.totalYes ?? 0n
  const totalNo = marketInfo?.totalNo ?? 0n
  const totalPool = totalYes + totalNo
  const isOpen = marketInfo?.status === BinaryMarketStatus.Open
  const isResolved = marketInfo?.status === BinaryMarketStatus.Resolved
  const myYesPosition = yesPositions.find((p) => p.player?.toLowerCase() === address?.toLowerCase())
  const myNoPosition = noPositions.find((p) => p.player?.toLowerCase() === address?.toLowerCase())
  const myPosition = myYesPosition || myNoPosition
  const mySideLabel = myYesPosition ? 'YES' : myNoPosition ? 'NO' : null

  const shareText = useMemo(
    () => `Predict whether it rains in Cannes tomorrow — onchain market on Arc settled by Chainlink CRE.`,
    []
  )

  function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message.slice(0, 180)
    return 'Transaction failed'
  }

  async function handlePlacePrediction() {
    if (!publicClient || !address) return

    if (chainId !== MARKET_CHAIN.id) {
      setTxStep('error')
      setErrorMsg(`Switch to ${MARKET_CHAIN_LABEL} to place your prediction.`)
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
          {/* Left column */}
          <section className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">
                Arc · Binary Prediction Market
              </p>
              <h1 className="mt-4 max-w-3xl font-[var(--font-display)] text-4xl font-semibold tracking-[-0.05em] md:text-6xl">
                {marketInfo?.question || 'Will it rain in Cannes tomorrow?'}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
                Outcome: <span className="font-semibold text-[var(--color-ink)]">0 = No</span>,{' '}
                <span className="font-semibold text-[var(--color-ink)]">1 = Yes</span>. Settlement
                delivered by Chainlink CRE.
              </p>
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
                  <MetricCard label="YES Pool" value={`${formatUsdc(totalYes)} USDC`} />
                  <MetricCard label="NO Pool" value={`${formatUsdc(totalNo)} USDC`} />
                  <MetricCard label="Total Pool" value={`${formatUsdc(totalPool)} USDC`} />
                </div>

                <div className="mt-6 grid gap-3 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm text-[var(--color-muted)] md:grid-cols-2">
                  <div>
                    Betting closes:{' '}
                    <span className="font-medium text-[var(--color-ink)]">
                      {marketInfo.bettingDeadline > 0n
                        ? new Date(Number(marketInfo.bettingDeadline) * 1000).toLocaleString()
                        : '--'}
                    </span>
                  </div>
                  <div>
                    Start time:{' '}
                    <span className="font-medium text-[var(--color-ink)]">
                      {marketInfo.startTime > 0n
                        ? new Date(Number(marketInfo.startTime) * 1000).toLocaleString()
                        : 'Waiting for CRE lock'}
                    </span>
                  </div>
                  <div>
                    Resolve after:{' '}
                    <span className="font-medium text-[var(--color-ink)]">
                      {Number(marketInfo.duration) / 60} min
                    </span>
                  </div>
                  <div>
                    Result:{' '}
                    <span className="font-medium text-[var(--color-ink)]">
                      {marketInfo.status === BinaryMarketStatus.Resolved
                        ? marketInfo.resolvedOutcome === BinaryOutcome.Yes
                          ? '1 = Yes'
                          : '0 = No'
                        : 'Pending'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {marketInfo && (yesPositions.length > 0 || noPositions.length > 0) && (
              <div className="glow-card rounded-[28px] p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">
                  Participants
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <PositionList title="YES" positions={yesPositions} address={address} />
                  <PositionList title="NO" positions={noPositions} address={address} />
                </div>
              </div>
            )}
          </section>

          {/* Right column */}
          <section className="space-y-6">
            {/* Bridge panel — shown when not on Arc */}
            {isConnected && !isOnMarketChain && (
              <BridgePanel amount={amount} onBridged={refetchArcBalance} />
            )}

            {/* Action panel — shown when on Arc */}
            {isConnected && isOnMarketChain && (
              <div className="glow-card rounded-[28px] p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">
                  Action Panel
                </p>

                {isOpen && !myPosition && (
                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setOutcome(BinaryOutcome.Yes)}
                        className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${
                          outcome === BinaryOutcome.Yes
                            ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] ring-1 ring-[rgba(34,197,94,0.4)]'
                            : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'
                        }`}
                      >
                        YES
                      </button>
                      <button
                        onClick={() => setOutcome(BinaryOutcome.No)}
                        className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${
                          outcome === BinaryOutcome.No
                            ? 'bg-[rgba(239,68,68,0.12)] text-[#dc2626] ring-1 ring-[rgba(239,68,68,0.4)]'
                            : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'
                        }`}
                      >
                        NO
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Amount (USDC)</span>
                        <span className="rounded-xl bg-[rgba(0,0,255,0.07)] px-3 py-1 text-sm font-bold text-[var(--color-cyan)]">{amount} USDC</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={500}
                        step={1}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full accent-[var(--color-cyan)] cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--color-muted)]">
                        <span>1</span><span>250</span><span>500</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-3 text-sm text-[var(--color-muted)]">
                      Your balance:{' '}
                      <span className="font-semibold text-[var(--color-ink)]">
                        {arcUsdcBalance !== undefined ? `${formatUsdc(arcUsdcBalance)} USDC` : '--'}
                      </span>
                    </div>

                    <button
                      onClick={handlePlacePrediction}
                      disabled={!hasEnoughArcUsdc || txStep === 'approving' || txStep === 'placing'}
                      className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {txStep === 'approving'
                        ? 'Approving USDC…'
                        : txStep === 'placing'
                          ? 'Placing prediction…'
                          : needsApproval
                            ? 'Approve & Join'
                            : 'Place Prediction'}
                    </button>

                    {!hasEnoughArcUsdc && arcUsdcBalance !== undefined && (
                      <p className="text-sm text-[var(--color-cyan)]">
                        Insufficient Arc USDC. Bridge from the panel on the left.
                      </p>
                    )}
                  </div>
                )}

                {myPosition && (
                  <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 space-y-3">
                    <p className="text-sm text-[var(--color-ink)]">
                      You joined on the{' '}
                      <span className="font-semibold">{mySideLabel}</span> side.
                    </p>
                    <div className="flex items-center justify-between border-t border-[rgba(0,0,255,0.08)] pt-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{privacyMode ? '🔒' : '🔓'}</span>
                        <span className="text-xs text-[var(--color-muted)]">
                          {privacyMode ? 'Privacy mode ON — ACE payout' : 'Privacy mode OFF — on-chain payout'}
                        </span>
                      </div>
                      <Link
                        to="/ace"
                        state={{ tab: 'shielded' }}
                        className="text-xs font-semibold text-[var(--color-cyan)] hover:underline"
                      >
                        {privacyMode ? 'Manage' : 'Enable'}
                      </Link>
                    </div>
                  </div>
                )}

                {isResolved && claimableAmount && claimableAmount > 0n && !hasClaimed && (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-cyan)]">
                        Claimable
                      </p>
                      <p className="mt-3 text-2xl font-semibold">
                        {formatUsdc(claimableAmount)} USDC
                      </p>
                    </div>
                    {privacyMode ? (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.06)] p-4">
                          <div className="flex items-center gap-2">
                            <span className="text-base">🔒</span>
                            <p className="text-sm font-semibold text-[#15803d]">ACE Private Payout Pending</p>
                          </div>
                          <p className="mt-1 text-xs text-[var(--color-muted)]">
                            You have privacy mode enabled. The settlement worker will transfer your winnings to your shielded address automatically.
                          </p>
                        </div>
                        <Link
                          to="/ace"
                          className="flex w-full items-center justify-center gap-2 rounded-full border border-[rgba(0,0,255,0.22)] bg-[rgba(0,0,255,0.06)] px-5 py-4 text-sm font-semibold text-[var(--color-cyan)] hover:bg-[rgba(0,0,255,0.10)]"
                        >
                          View ACE Vault
                        </Link>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={handleClaim}
                          disabled={txStep === 'claiming'}
                          className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {txStep === 'claiming' ? 'Claiming…' : 'Claim On-Chain'}
                        </button>
                        <Link
                          to="/ace"
                          className="flex w-full items-center justify-center gap-2 rounded-full border border-[rgba(0,0,255,0.22)] bg-[rgba(0,0,255,0.06)] px-5 py-4 text-sm font-semibold text-[var(--color-cyan)] hover:bg-[rgba(0,0,255,0.10)]"
                        >
                          🔒 Enable Privacy Mode (ACE Vault)
                        </Link>
                      </>
                    )}
                  </div>
                )}

                {isResolved && (!claimableAmount || claimableAmount === 0n) && hasClaimed && (
                  <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.12)] bg-[rgba(0,0,255,0.04)] p-4 text-sm text-[var(--color-muted)]">
                    Payout claimed. Check your{' '}
                    <Link to="/ace" className="font-semibold text-[var(--color-cyan)] underline">
                      ACE private vault
                    </Link>{' '}
                    for privacy-preserving transfers.
                  </div>
                )}

                {txStep === 'done' && (
                  <div className="mt-5 rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.06)] p-4 text-sm font-semibold text-[#15803d]">
                    Transaction confirmed ✓
                  </div>
                )}

                {txStep === 'error' && errorMsg && (
                  <div className="mt-5 rounded-2xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.06)] p-4 text-sm text-red-600">
                    {errorMsg}
                  </div>
                )}
              </div>
            )}

            {!isConnected && (
              <div className="glow-card rounded-[28px] p-6">
                <p className="text-sm text-[var(--color-muted)]">
                  Connect a wallet to join or claim from this market.
                </p>
              </div>
            )}

            {/* Resources */}
            <div className="glow-card rounded-[28px] p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">
                Resources
              </p>
              <div className="mt-4 grid gap-3">
                <a
                  href={getExplorerAddressUrl(marketAddress, MARKET_CHAIN.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-4 text-center text-sm font-semibold text-[var(--color-ink)]"
                >
                  View on Explorer ↗
                </a>
                {!isOnMarketChain && isConnected && (
                  <button
                    onClick={() => switchChain({ chainId: MARKET_CHAIN.id })}
                    className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-5 py-4 text-sm font-semibold text-[var(--color-cyan)]"
                  >
                    Switch to {MARKET_CHAIN_LABEL}
                  </button>
                )}
                <a
                  href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}%20${encodeURIComponent(window.location.href)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-5 py-4 text-center text-sm font-semibold text-[var(--color-cyan)]"
                >
                  Share on X ↗
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
        {positions.length === 0 && (
          <p className="text-sm text-[var(--color-muted)]">No positions yet.</p>
        )}
        {positions.map((position, index) => (
          <div key={`${title}-${index}`} className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-ink)]">
              {shortenAddress(position.player)}
              {position.player?.toLowerCase() === address?.toLowerCase() && (
                <span className="text-[var(--color-muted)]"> (you)</span>
              )}
            </span>
            <span className="text-[var(--color-cyan)]">{formatUsdc(position.amount)} USDC</span>
          </div>
        ))}
      </div>
    </div>
  )
}
