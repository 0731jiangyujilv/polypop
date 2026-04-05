import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'

export function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,255,0.08),transparent_28%),radial-gradient(circle_at_85%_18%,rgba(0,0,255,0.08),transparent_22%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-between px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <Logo />
          <Link
            to="/stats"
            className="rounded-full border border-[rgba(20,20,20,0.12)] bg-white px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)] transition hover:border-[rgba(0,0,255,0.24)]"
          >
            Live Stats
          </Link>
        </header>

        <main className="grid gap-10 py-12 md:grid-cols-[1.25fr_0.75fr] md:items-center">
          <section>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,0,255,0.18)] bg-[rgba(0,0,255,0.06)] px-4 py-2 text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">
              X-native prediction markets
            </div>
            <h1 className="mt-6 max-w-3xl font-[var(--font-display)] text-5xl font-semibold leading-[1.02] tracking-[-0.06em] md:text-7xl">
              Turn an X post into an on-chain market with a cleaner command surface.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--color-muted)] md:text-lg">
              Mention the bot on X, generate a market link, create the contract on Arc,
              and let participants bridge USDC in from Base before joining and settling on Arc.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/create"
                className="rounded-full bg-[var(--color-cyan)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Create Prediction
              </Link>
              <Link
                to="/stats"
                className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-6 py-3 text-sm font-semibold text-[var(--color-ink)] transition hover:border-[rgba(0,0,255,0.24)] hover:text-[var(--color-cyan)]"
              >
                Explore Metrics
              </Link>
            </div>
          </section>

          <section className="glow-card rounded-[28px] p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">How It Works</p>
            <div className="mt-6 space-y-4">
              {[
                ['1', 'Create the market', 'Connect on Arc and seed the WTI crude oil market onchain'],
                ['2', 'Bridge from other chains', 'Swap to USDC on Uniswap, then bridge into Arc via CCTP'],
                ['3', 'Join on Arc', 'Participants choose UP or DOWN and stake USDC'],
                ['4', 'Resolve with CRE', 'Chainlink CRE locks and resolves the binary outcome'],
                ['5', 'Claim payout', 'Winners claim their proportional share of the prize pool'],
              ].map(([step, title, desc]) => (
                <div key={step} className="flex gap-4 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(0,0,255,0.08)] text-sm font-semibold text-[var(--color-cyan)]">
                    {step}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-[rgba(0,0,255,0.14)] bg-[rgba(0,0,255,0.05)] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]">Fee model</p>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Total fee is 1%. The market creator gets 30% of that fee, with the remaining 70% routed to the platform.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
