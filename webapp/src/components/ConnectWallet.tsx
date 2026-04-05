import { useState } from 'react'
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { MARKET_CHAIN, MARKET_CHAIN_LABEL } from '@/config/chains'
import { shortenAddress } from '@/lib/utils'

function getConnectorLogoMeta(name: string) {
  const normalized = name.toLowerCase()

  if (normalized.includes('metamask')) {
    return { label: '🦊', className: 'bg-[rgba(241,135,0,0.14)] text-[#f18700]' }
  }

  if (normalized.includes('coinbase')) {
    return { label: 'C', className: 'bg-[rgba(0,82,255,0.14)] text-[#0052ff]' }
  }

  if (normalized.includes('walletconnect')) {
    return { label: 'W', className: 'bg-[rgba(59,130,246,0.14)] text-[#2563eb]' }
  }

  if (normalized.includes('injected')) {
    return { label: 'I', className: 'bg-[rgba(20,20,20,0.08)] text-[var(--color-ink)]' }
  }

  return { label: name.charAt(0).toUpperCase() || '?', className: 'bg-[rgba(20,20,20,0.08)] text-[var(--color-ink)]' }
}

type ChainId = 5042002 | 1 | 84532 | 11155111

type ConnectWalletProps = {
  requiredChainId?: ChainId
  requiredChainLabel?: string
  actionLabel?: string
}

export function ConnectWallet({
  requiredChainId = MARKET_CHAIN.id as ChainId,
  requiredChainLabel = MARKET_CHAIN_LABEL,
  actionLabel = 'create, join, or claim prediction markets',
}: ConnectWalletProps = {}) {
  const [isChooserOpen, setIsChooserOpen] = useState(false)
  const { address, isConnected } = useAccount()
  const { connectors, connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const isWrongNetwork = isConnected && chainId !== requiredChainId

  if (isConnected && address) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-[rgba(0,0,255,0.18)] bg-[rgba(0,0,255,0.06)] px-4 py-2 text-sm font-medium text-[var(--color-cyan)]">
            {shortenAddress(address)}
          </div>
          <button
            onClick={() => disconnect()}
            className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-4 py-2 text-sm text-[var(--color-ink)] transition-colors hover:border-[rgba(0,0,255,0.28)] hover:text-[var(--color-cyan)]"
          >
            Disconnect
          </button>
        </div>

        {isWrongNetwork && (
          <div className="rounded-2xl border border-[rgba(0,0,255,0.18)] bg-[rgba(0,0,255,0.05)] p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-orange)]">Wrong Network</p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">Switch to {requiredChainLabel} to {actionLabel}.</p>
            <button
              onClick={() => switchChain({ chainId: requiredChainId as ChainId })}
              className="mt-4 w-full rounded-full bg-[var(--color-cyan)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Switch to {requiredChainLabel}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-3">
      <button
        onClick={() => setIsChooserOpen(true)}
        disabled={isPending || connectors.length === 0}
        className="rounded-full bg-[var(--color-cyan)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? 'Connecting...' : 'Connect Wallet'}
      </button>

      {isChooserOpen && (
        <div className="absolute right-0 top-full z-30 mt-3 w-72 rounded-2xl border border-[rgba(20,20,20,0.1)] bg-white p-3 shadow-[0_18px_44px_rgba(20,20,20,0.14)]">
          <p className="px-2 py-1 text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Choose wallet</p>
          <div className="mt-1 space-y-2">
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => {
                  connect({ connector })
                  setIsChooserOpen(false)
                }}
                disabled={isPending}
                className="w-full rounded-xl border border-[rgba(20,20,20,0.1)] bg-white px-4 py-3 text-left text-sm font-medium text-[var(--color-ink)] transition hover:border-[rgba(0,0,255,0.28)] hover:text-[var(--color-cyan)] disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${getConnectorLogoMeta(connector.name).className}`}
                  >
                    {getConnectorLogoMeta(connector.name).label}
                  </span>
                  <span>{connector.name}</span>
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsChooserOpen(false)}
            className="mt-3 w-full rounded-xl bg-[rgba(0,0,255,0.06)] px-4 py-2 text-sm font-medium text-[var(--color-cyan)] transition hover:bg-[rgba(0,0,255,0.1)]"
          >
            Cancel
          </button>
        </div>
      )}

      {connectors.length === 0 && (
        <button
          disabled
          className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-3 text-sm text-[var(--color-muted)]"
        >
          No wallet connectors available
        </button>
      )}
    </div>
  )
}
