import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { decodeEventLog, formatUnits, parseUnits } from 'viem'
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { getExplorerAddressUrl, MARKET_CHAIN, MARKET_CHAIN_LABEL, SOURCE_CHAIN_LABEL, getChainLabel } from '@/config/chains'
import {
  BINARY_MARKET_FACTORY_ABI,
  BINARY_MARKET_FACTORY_ADDRESS,
  BinaryOutcome,
  ERC20_ABI,
  MARKET_USDC_ADDRESS,
} from '@/config/contracts'
import { getArcBridgeUrl } from '@/lib/bridge'
import { formatUsdc } from '@/lib/utils'
import { getUniswapSwapUrl } from '@/lib/uniswap'

type TxStep = 'idle' | 'approving' | 'creating' | 'done' | 'error'

const DEFAULT_MIN_AMOUNT = 10
const DEFAULT_MAX_AMOUNT = 1000

type MarketCreatedEventArgs = {
  market?: string
  marketId?: bigint
}

export function HackathonCreatePage() {
  const navigate = useNavigate()
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [createdMarket, setCreatedMarket] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<number>(BinaryOutcome.Yes)
  const [amount, setAmount] = useState('5')
  const [durationMinutes, setDurationMinutes] = useState('1')
  const [livePrice, setLivePrice] = useState<string | null>(null)

  const amountUnits = amount ? parseUnits(amount, 6) : 0n
  const durationSeconds = BigInt(Math.max(1, Number(durationMinutes) || 1) * 60)

  // const { data: question } = useReadContract({
  //   address: BINARY_MARKET_FACTORY_ADDRESS,
  //   abi: BINARY_MARKET_FACTORY_ABI,
  //   functionName: 'DEFAULT_QUESTION',
  //   chainId: MARKET_CHAIN.id,
  //   query: { enabled: BINARY_MARKET_FACTORY_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  // })

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
      enabled: !!address
        && BINARY_MARKET_FACTORY_ADDRESS !== '0x0000000000000000000000000000000000000000'
        && MARKET_USDC_ADDRESS !== '0x0000000000000000000000000000000000000000',
    },
  })

  const { data: marketUsdcBalance } = useReadContract({
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

  const networkLabel = getChainLabel(chainId)
  const bridgeHref = getArcBridgeUrl(amount)
  const uniswapHref = getUniswapSwapUrl()
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
  const hasEnoughUsdc = marketUsdcBalance !== undefined && marketUsdcBalance >= amountUnits
  const minDurationMinutes = Number((minDuration ?? 60n) / 60n)

  const createdMarketUrl = useMemo(() => {
    if (!createdMarket || !window?.location?.origin) return ''
    return `${window.location.origin}/demo/market/${createdMarket}`
  }, [createdMarket])

  function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message.slice(0, 180)
    return 'Transaction failed'
  }

  async function handleCreateMarket() {
    if (!address || !publicClient) return

    if (chainId !== MARKET_CHAIN.id) {
      setTxStep('error')
      setErrorMsg(`Switch to ${MARKET_CHAIN_LABEL} before creating the demo market.`)
      return
    }

    if (BINARY_MARKET_FACTORY_ADDRESS === '0x0000000000000000000000000000000000000000') {
      setTxStep('error')
      setErrorMsg('Set VITE_BINARY_MARKET_FACTORY_ADDRESS before using the hackathon demo.')
      return
    }

    if (MARKET_USDC_ADDRESS === '0x0000000000000000000000000000000000000000') {
      setTxStep('error')
      setErrorMsg('Set VITE_MARKET_USDC_ADDRESS for Arc USDC before creating the demo market.')
      return
    }

    if ((Number(durationMinutes) || 0) < minDurationMinutes) {
      setTxStep('error')
      setErrorMsg(`Duration must be at least ${minDurationMinutes} minute.`)
      return
    }

    if (!hasEnoughUsdc) {
      setTxStep('error')
      setErrorMsg(`You need enough Arc USDC to seed the market. Bridge from ${SOURCE_CHAIN_LABEL} first if needed.`)
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
          parseUnits(String(DEFAULT_MIN_AMOUNT), 6),
          parseUnits(String(DEFAULT_MAX_AMOUNT), 6),
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
            strict: false,
          })
          return decoded.eventName === 'MarketCreated'
        } catch {
          return false
        }
      })

      if (!creationLog) {
        throw new Error('MarketCreated event not found in receipt')
      }

      const decoded = decodeEventLog({
        abi: BINARY_MARKET_FACTORY_ABI,
        data: creationLog.data,
        topics: creationLog.topics,
        strict: false,
      })
      const args = decoded.args as unknown as MarketCreatedEventArgs
      const marketAddress = args.market

      if (!marketAddress) {
        throw new Error('Market address missing from receipt')
      }

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
          <section className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Hackathon Demo</p>
              <h1 className="mt-4 max-w-3xl font-[var(--font-display)] text-2xl font-semibold tracking-[-0.03em] md:text-3xl">
                {'Will crude oil price be higher in 6 hours?'}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
                This flow is pure onchain. Creation, participation, settlement, and claims all happen directly against Arc contracts.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Asset</p>
                <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">OIL/USD</p>
              </div>
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Duration</p>
                <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">{Number(durationMinutes) >= 60 ? `${(Number(durationMinutes) / 60).toFixed(1).replace('.0', '')}h` : `${durationMinutes}m`}</p>
              </div>
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Live Price</p>
                <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">{livePrice ? `$${Number(livePrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'Loading...'}</p>
                <p className="mt-1 text-[10px] text-[var(--color-muted)]">Powered by Chainlink CRE</p>
              </div>
            </div>
          </section>

          <section className="glow-card rounded-[28px] p-6">
            {txStep !== 'done' && (
              <>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Create Market</p>
                <div className="mt-5 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--color-muted)]">Connected Network</span>
                    <span className="font-medium text-[var(--color-ink)]">{networkLabel}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[var(--color-muted)]">{MARKET_CHAIN_LABEL} Gas</span>
                    <span className="font-medium text-[var(--color-ink)]">
                      {nativeBalance ? `${Number(formatUnits(nativeBalance.value, nativeBalance.decimals)).toFixed(4)} ${nativeBalance.symbol}` : '--'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[var(--color-muted)]">{MARKET_CHAIN_LABEL} USDC</span>
                    <span className="font-medium text-[var(--color-ink)]">{marketUsdcBalance !== undefined ? `${formatUsdc(marketUsdcBalance)} USDC` : '--'}</span>
                  </div>
                </div>

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
                    Initial Stake (USDC)
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white px-4 py-4 text-base text-[var(--color-ink)]"
                    />
                  </label>

                  <label className="block text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">
                    Resolve After Lock (minutes, max 720 = 12h)
                    <input
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white px-4 py-4 text-base text-[var(--color-ink)]"
                    />
                  </label>

                  <div className="rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-muted)]">
                    The second participant must take the opposite side and contribute at least {amount || '0'} USDC.
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <button
                    onClick={handleCreateMarket}
                    className="rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white"
                  >
                    {txStep === 'approving' ? 'Approving USDC...' : txStep === 'creating' ? 'Creating On Arc...' : 'Create Demo Market'}
                  </button>
                  <a
                    href={bridgeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-4 text-center text-sm font-semibold text-[var(--color-ink)]"
                  >
                    Bridge USDC To Arc
                  </a>
                  <a
                    href={uniswapHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-5 py-4 text-center text-sm font-semibold text-[var(--color-cyan)]"
                  >
                    Swap To USDC On Uniswap
                  </a>
                </div>
              </>
            )}

            {txStep === 'done' && createdMarket && (
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Market Live</p>
                <h2 className="mt-3 text-2xl font-semibold">The crude oil market is onchain.</h2>
                <div className="mt-5 rounded-2xl border border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Market Address</p>
                  <p className="mt-2 break-all text-sm text-[var(--color-ink)]">{createdMarket}</p>
                </div>
                <div className="mt-5 grid gap-3">
                  <Link
                    to={`/demo/market/${createdMarket}`}
                    className="rounded-full bg-[var(--color-cyan)] px-5 py-4 text-center text-sm font-semibold text-white"
                  >
                    Open Demo Market
                  </Link>
                  <a
                    href={getExplorerAddressUrl(createdMarket, MARKET_CHAIN.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-4 text-center text-sm font-semibold text-[var(--color-ink)]"
                  >
                    View On Explorer
                  </a>
                  {createdMarketUrl && (
                    <button
                      onClick={() => navigate(`/demo/market/${createdMarket}`)}
                      className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-5 py-4 text-sm font-semibold text-[var(--color-cyan)]"
                    >
                      Enter Market
                    </button>
                  )}
                </div>
              </div>
            )}

            {txStep === 'error' && (
              <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                {errorMsg}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
