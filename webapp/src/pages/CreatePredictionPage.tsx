import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { decodeEventLog, formatUnits, parseUnits } from 'viem'
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { BridgePanel } from '@/components/BridgePanel'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { getExplorerAddressUrl, MARKET_CHAIN, MARKET_CHAIN_LABEL, getChainLabel } from '@/config/chains'
import {
  BINARY_MARKET_FACTORY_ABI,
  BINARY_MARKET_FACTORY_ADDRESS,
  BinaryOutcome,
  ERC20_ABI,
  MARKET_USDC_ADDRESS,
} from '@/config/contracts'
import { formatUsdc } from '@/lib/utils'

type TxStep = 'idle' | 'approving' | 'creating' | 'done' | 'error'

type MarketCreatedEventArgs = {
  market?: string
  marketId?: bigint
}

export function CreatePredictionPage() {
  const navigate = useNavigate()
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [createdMarket, setCreatedMarket] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<number>(BinaryOutcome.Yes)
  const [amount, setAmount] = useState('50')
  const [durationMinutes, setDurationMinutes] = useState('1')

  const amountUnits = amount ? parseUnits(amount, 6) : 0n
  const durationSeconds = BigInt(Math.max(1, Number(durationMinutes) || 1) * 60)

  const isOnMarketChain = chainId === MARKET_CHAIN.id
  const networkLabel = getChainLabel(chainId)

  const { data: question } = useReadContract({
    address: BINARY_MARKET_FACTORY_ADDRESS,
    abi: BINARY_MARKET_FACTORY_ABI,
    functionName: 'DEFAULT_QUESTION',
    chainId: MARKET_CHAIN.id,
    query: { enabled: BINARY_MARKET_FACTORY_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const { data: minDuration } = useReadContract({
    address: BINARY_MARKET_FACTORY_ADDRESS,
    abi: BINARY_MARKET_FACTORY_ABI,
    functionName: 'minDuration',
    chainId: MARKET_CHAIN.id,
    query: { enabled: BINARY_MARKET_FACTORY_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: MARKET_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, BINARY_MARKET_FACTORY_ADDRESS] : undefined,
    chainId: MARKET_CHAIN.id,
    query: {
      enabled:
        !!address &&
        BINARY_MARKET_FACTORY_ADDRESS !== '0x0000000000000000000000000000000000000000' &&
        MARKET_USDC_ADDRESS !== '0x0000000000000000000000000000000000000000',
    },
  })

  const { data: arcUsdcBalance, refetch: refetchArcBalance } = useReadContract({
    address: MARKET_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: MARKET_CHAIN.id,
    query: { enabled: !!address && MARKET_USDC_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const { data: nativeBalance } = useBalance({
    address,
    chainId: MARKET_CHAIN.id,
    query: { enabled: !!address },
  })

  const { writeContractAsync: writeApprove } = useWriteContract()
  const { writeContractAsync: writeCreate } = useWriteContract()

  const hasEnoughUsdc = arcUsdcBalance !== undefined && arcUsdcBalance >= amountUnits
  const minDurationMinutes = Number((minDuration ?? 60n) / 60n)

  const createdMarketUrl = useMemo(() => {
    if (!createdMarket || !window?.location?.origin) return ''
    return `${window.location.origin}/market/${createdMarket}`
  }, [createdMarket])

  function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message.slice(0, 180)
    return 'Transaction failed'
  }

  async function handleCreateMarket() {
    if (!address || !publicClient) return

    if (chainId !== MARKET_CHAIN.id) {
      setTxStep('error')
      setErrorMsg(`Switch to ${MARKET_CHAIN_LABEL} to create the market.`)
      return
    }

    if (BINARY_MARKET_FACTORY_ADDRESS === '0x0000000000000000000000000000000000000000') {
      setTxStep('error')
      setErrorMsg('Contract not configured. Set VITE_BINARY_MARKET_FACTORY_ADDRESS.')
      return
    }

    if (MARKET_USDC_ADDRESS === '0x0000000000000000000000000000000000000000') {
      setTxStep('error')
      setErrorMsg('USDC address not configured. Set VITE_MARKET_USDC_ADDRESS.')
      return
    }

    if ((Number(durationMinutes) || 0) < minDurationMinutes) {
      setTxStep('error')
      setErrorMsg(`Resolve delay must be at least ${minDurationMinutes} minute(s).`)
      return
    }

    if (!hasEnoughUsdc) {
      setTxStep('error')
      setErrorMsg('Insufficient Arc USDC balance. Bridge USDC to Arc first.')
      return
    }

    try {
      setErrorMsg('')

      if ((allowance ?? 0n) < amountUnits) {
        setTxStep('approving')
        const approveTx = await writeApprove({
          address: MARKET_USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [BINARY_MARKET_FACTORY_ADDRESS, amountUnits],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTx })
        await refetchAllowance()
      }

      setTxStep('creating')
      const createTx = await writeCreate({
        address: BINARY_MARKET_FACTORY_ADDRESS,
        abi: BINARY_MARKET_FACTORY_ABI,
        functionName: 'createMarket',
        args: [
          MARKET_USDC_ADDRESS,
          parseUnits('1', 6),
          0n,
          durationSeconds,
          outcome,
          amountUnits,
        ],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createTx })
      const creationLog = receipt.logs.find((log) => {
        try {
          const decoded = decodeEventLog({
            abi: BINARY_MARKET_FACTORY_ABI,
            data: log.data,
            topics: log.topics,
          })
          return decoded.eventName === 'MarketCreated'
        } catch {
          return false
        }
      })

      if (!creationLog) throw new Error('MarketCreated event not found in receipt')

      const decoded = decodeEventLog({
        abi: BINARY_MARKET_FACTORY_ABI,
        data: creationLog.data,
        topics: creationLog.topics,
      })
      const args = decoded.args as unknown as MarketCreatedEventArgs
      const marketAddress = args.market

      if (!marketAddress) throw new Error('Market address missing from receipt')

      setCreatedMarket(marketAddress)
      setTxStep('done')
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
                {question || 'Will it rain in Cannes tomorrow?'}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
                All logic is onchain. Creation, participation, settlement, and claims run directly
                against Arc contracts — settled by Chainlink CRE.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Settlement</p>
                <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">Chainlink CRE</p>
              </div>
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Bet Window</p>
                <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">10 minutes</p>
              </div>
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Min Resolve Delay</p>
                <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">
                  {minDurationMinutes} min
                </p>
              </div>
            </div>

            {/* Bridge panel — shown when not on Arc or insufficient balance */}
            {address && (!isOnMarketChain || (isOnMarketChain && !hasEnoughUsdc && arcUsdcBalance !== undefined)) && (
              <BridgePanel amount={amount} onBridged={refetchArcBalance} />
            )}
          </section>

          {/* Right column — create form */}
          <section className="glow-card rounded-[28px] p-6">
            {txStep !== 'done' && (
              <>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">
                  Create Market
                </p>

                {/* Status strip */}
                <div className="mt-5 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--color-muted)]">Network</span>
                    <span className="font-medium text-[var(--color-ink)]">{networkLabel}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[var(--color-muted)]">{MARKET_CHAIN_LABEL} Gas</span>
                    <span className="font-medium text-[var(--color-ink)]">
                      {nativeBalance
                        ? `${Number(formatUnits(nativeBalance.value, nativeBalance.decimals)).toFixed(4)} ${nativeBalance.symbol}`
                        : '--'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[var(--color-muted)]">{MARKET_CHAIN_LABEL} USDC</span>
                    <span className="font-medium text-[var(--color-ink)]">
                      {arcUsdcBalance !== undefined ? `${formatUsdc(arcUsdcBalance)} USDC` : '--'}
                    </span>
                  </div>
                </div>

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
                      <span className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Initial Stake (USDC)</span>
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

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Resolve Delay After Lock</span>
                      <span className="rounded-xl bg-[rgba(0,0,255,0.07)] px-3 py-1 text-sm font-bold text-[var(--color-cyan)]">{durationMinutes} min</span>
                    </div>
                    <input
                      type="range"
                      min={minDurationMinutes || 1}
                      max={60}
                      step={1}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      className="w-full accent-[var(--color-cyan)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--color-muted)]">
                      <span>{minDurationMinutes || 1}m</span><span>30m</span><span>60m</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-muted)]">
                    The opposing participant must choose the other side and stake at least{' '}
                    <span className="font-semibold text-[var(--color-ink)]">{amount || '0'} USDC</span>.
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <button
                    onClick={handleCreateMarket}
                    disabled={txStep === 'approving' || txStep === 'creating'}
                    className="rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {txStep === 'approving'
                      ? 'Approving USDC…'
                      : txStep === 'creating'
                        ? 'Creating on Arc…'
                        : 'Create Market'}
                  </button>
                </div>

                {txStep === 'error' && errorMsg && (
                  <div className="mt-4 rounded-2xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.06)] p-4 text-sm text-red-600">
                    {errorMsg}
                  </div>
                )}
              </>
            )}

            {txStep === 'done' && createdMarket && (
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">
                  Market Live
                </p>
                <h2 className="mt-3 text-2xl font-semibold">Market is onchain.</h2>
                <div className="mt-5 rounded-2xl border border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">
                    Market Address
                  </p>
                  <p className="mt-2 break-all text-sm text-[var(--color-ink)]">{createdMarket}</p>
                </div>
                <div className="mt-5 grid gap-3">
                  <Link
                    to={`/market/${createdMarket}`}
                    className="rounded-full bg-[var(--color-cyan)] px-5 py-4 text-center text-sm font-semibold text-white"
                  >
                    Open Market
                  </Link>
                  <a
                    href={getExplorerAddressUrl(createdMarket, MARKET_CHAIN.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-4 text-center text-sm font-semibold text-[var(--color-ink)]"
                  >
                    View on Explorer ↗
                  </a>
                  {createdMarketUrl && (
                    <button
                      onClick={() => navigate(`/market/${createdMarket}`)}
                      className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-5 py-4 text-sm font-semibold text-[var(--color-cyan)]"
                    >
                      Enter Market
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
