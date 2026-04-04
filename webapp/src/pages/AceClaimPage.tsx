import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAccount, useChainId, useSignTypedData, useSwitchChain } from 'wagmi'
import { formatUnits } from 'viem'
import {
  ACE_DOMAIN,
  ACE_TOKEN_ADDRESS,
  nowTimestamp,
  fetchAceBalances,
  fetchAceTransactions,
  submitAceWithdraw,
  fetchAceShieldedAddress,
  type AceBalance,
  type AceTransaction,
} from '@/lib/aceApi'
import { ConnectWallet } from '@/components/ConnectWallet'

type Panel = 'balance' | 'transactions' | 'withdraw' | 'shielded'

function toErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}

const API_BASE = import.meta.env.VITE_BOT_API_URL ?? 'http://localhost:3000'

const SEPOLIA_CHAIN_ID = 11155111

export function AceClaimPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const location = useLocation()
  const isOnSepolia = chainId === SEPOLIA_CHAIN_ID

  const [panel, setPanel] = useState<Panel>(
    (location.state as { tab?: Panel } | null)?.tab ?? 'balance'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [balances, setBalances] = useState<AceBalance[] | null>(null)
  const [transactions, setTransactions] = useState<AceTransaction[] | null>(null)
  const [shieldedAddress, setShieldedAddress] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawTicket, setWithdrawTicket] = useState('')

  const [savedShieldedAddress, setSavedShieldedAddress] = useState<string | null>(null)
  const [privacyModeEnabled, setPrivacyModeEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!address) { setSavedShieldedAddress(null); setPrivacyModeEnabled(false); return }
    fetch(`${API_BASE}/api/user/privacy/${address}`)
      .then(r => r.json())
      .then((d: { shieldedAddress: string | null; privacyMode: boolean }) => {
        setSavedShieldedAddress(d.shieldedAddress)
        setPrivacyModeEnabled(d.privacyMode)
      })
      .catch(() => {})
  }, [address])

  async function handleSaveShieldedAddress(addr: string) {
    if (!address) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/api/user/privacy/${address}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shieldedAddress: addr }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSavedShieldedAddress(addr)
      setPrivacyModeEnabled(true)
    } catch (err) { setError(toErrMsg(err)) }
    finally { setSaving(false) }
  }

  async function handleRemovePrivacy() {
    if (!address) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/api/user/privacy/${address}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      setSavedShieldedAddress(null)
      setPrivacyModeEnabled(false)
      setShieldedAddress('')
    } catch (err) { setError(toErrMsg(err)) }
    finally { setSaving(false) }
  }

  const { signTypedDataAsync } = useSignTypedData()

  async function handleCheckBalance() {
    setLoading(true); setError('')
    try {
      const ts = nowTimestamp()
      const auth = await signTypedDataAsync({
        domain: ACE_DOMAIN,
        types: { 'Retrieve Balances': [{ name: 'account', type: 'address' }, { name: 'timestamp', type: 'uint256' }] } as const,
        primaryType: 'Retrieve Balances',
        message: { account: address!, timestamp: ts },
      })
      setBalances(await fetchAceBalances(address!, ts, auth))
    } catch (err) { setError(toErrMsg(err)) }
    finally { setLoading(false) }
  }

  async function handleCheckTransactions() {
    setLoading(true); setError('')
    try {
      const ts = nowTimestamp()
      const auth = await signTypedDataAsync({
        domain: ACE_DOMAIN,
        types: { 'List Transactions': [
          { name: 'account', type: 'address' }, { name: 'timestamp', type: 'uint256' },
          { name: 'cursor', type: 'string' }, { name: 'limit', type: 'uint256' },
        ]} as const,
        primaryType: 'List Transactions',
        message: { account: address!, timestamp: ts, cursor: '', limit: 20n },
      })
      const res = await fetchAceTransactions(address!, ts, auth)
      setTransactions(res.transactions)
    } catch (err) { setError(toErrMsg(err)) }
    finally { setLoading(false) }
  }

  async function handleWithdraw() {
    if (!withdrawAmount || !address) return
    setLoading(true); setError('')
    try {
      const ts = nowTimestamp()
      const amount = BigInt(Math.round(parseFloat(withdrawAmount) * 1e6))
      const auth = await signTypedDataAsync({
        domain: ACE_DOMAIN,
        types: { 'Withdraw Tokens': [
          { name: 'account', type: 'address' }, { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' }, { name: 'timestamp', type: 'uint256' },
        ]} as const,
        primaryType: 'Withdraw Tokens',
        message: { account: address, token: ACE_TOKEN_ADDRESS, amount, timestamp: ts },
      })
      const result = await submitAceWithdraw(address, ACE_TOKEN_ADDRESS, amount, ts, auth)
      setWithdrawTicket(result.ticket)
    } catch (err) { setError(toErrMsg(err)) }
    finally { setLoading(false) }
  }

  async function handleGetShielded() {
    setLoading(true); setError('')
    try {
      const ts = nowTimestamp()
      const typedDataPayload = {
        domain: ACE_DOMAIN,
        types: { 'Generate Shielded Address': [{ name: 'account', type: 'address' }, { name: 'timestamp', type: 'uint256' }] } as const,
        primaryType: 'Generate Shielded Address' as const,
        message: { account: address!, timestamp: ts },
      }
      console.log('[ACE] signing payload:', JSON.stringify(typedDataPayload, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2))
      const auth = await signTypedDataAsync(typedDataPayload)
      console.log('[ACE] auth signature:', auth)
      const requestBody = { account: address!, timestamp: ts.toString(), auth }
      console.log('[ACE] request body →', JSON.stringify(requestBody, null, 2))
      const res = await fetchAceShieldedAddress(address!, ts, auth)
      setShieldedAddress(res.address)
    } catch (err) {
      console.error('[ACE] error:', err)
      setError(toErrMsg(err))
    }
    finally { setLoading(false) }
  }

  const tabs: { id: Panel; label: string }[] = [
    { id: 'balance', label: 'Balance' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'withdraw', label: 'Withdraw' },
    { id: 'shielded', label: 'Shielded Address' },
  ]

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--color-cyan)]">Chainlink ACE</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-ink)]">Private Winnings Vault</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Winning payouts are sent here privately via the Chainlink Automated Compliance Engine.
          </p>
          {isConnected && address && (
            <div className="mt-3 rounded-2xl border border-[rgba(0,0,255,0.12)] bg-[rgba(0,0,255,0.04)] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">Your ACE Account</p>
              <p className="mt-1 break-all font-mono text-sm font-semibold text-[var(--color-ink)]">{address}</p>
              <p className="mt-1 text-[10px] text-[var(--color-muted)]">This wallet address is your ACE vault identity. Sign with it to access your balance.</p>
            </div>
          )}
        </div>

        {!isConnected ? (
          <div className="rounded-[24px] border border-[rgba(0,0,255,0.14)] bg-[rgba(0,0,255,0.04)] p-6 text-center">
            <p className="mb-4 text-sm text-[var(--color-muted)]">Connect your wallet to access your private vault</p>
            <ConnectWallet actionLabel="access your ACE private vault" />
          </div>
        ) : (
          <>
            {/* Tabs */}
            {!isOnSepolia && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[rgba(234,179,8,0.3)] bg-[rgba(234,179,8,0.06)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <div>
                    <p className="text-xs font-semibold text-yellow-800">Wrong Network</p>
                    <p className="text-[10px] text-yellow-700">ACE Vault runs on Sepolia. Switch to sign & withdraw.</p>
                  </div>
                </div>
                <button
                  onClick={() => switchChain({ chainId: SEPOLIA_CHAIN_ID })}
                  disabled={isSwitching}
                  className="shrink-0 rounded-full bg-yellow-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-yellow-600 disabled:opacity-50"
                >
                  {isSwitching ? 'Switching…' : 'Switch to Sepolia'}
                </button>
              </div>
            )}

            <div className="mb-4 flex gap-1 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white p-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setPanel(t.id); setError('') }}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
                    panel === t.id
                      ? 'bg-[var(--color-cyan)] text-white'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="rounded-[24px] border border-[rgba(20,20,20,0.08)] bg-white p-5 space-y-4">
              {error && (
                <div className="rounded-2xl bg-[rgba(239,68,68,0.08)] p-3 text-xs text-red-600">{error}</div>
              )}

              {panel === 'balance' && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--color-muted)]">
                    Sign to view your private token balances in the ACE vault.
                  </p>
                  <button
                    onClick={handleCheckBalance}
                    disabled={loading}
                    className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? 'Signing…' : 'Check Balance'}
                  </button>
                  {balances && balances.length === 0 && (
                    <p className="text-sm text-[var(--color-muted)] text-center">No tokens in vault yet.</p>
                  )}
                  {balances && balances.map((b) => (
                    <div key={b.token} className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(0,0,255,0.04)] px-4 py-3">
                      <p className="text-xs text-[var(--color-muted)] truncate">{b.token}</p>
                      <p className="mt-1 text-lg font-bold text-[var(--color-ink)]">
                        {formatUnits(BigInt(b.amount), 6)} USDC
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {panel === 'transactions' && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--color-muted)]">
                    Sign to view your private transaction history.
                  </p>
                  <button
                    onClick={handleCheckTransactions}
                    disabled={loading}
                    className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? 'Signing…' : 'Load Transactions'}
                  </button>
                  {transactions && transactions.length === 0 && (
                    <p className="text-sm text-[var(--color-muted)] text-center">No transactions yet.</p>
                  )}
                  {transactions && transactions.map((tx) => (
                    <div key={tx.id} className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(0,0,0,0.02)] px-4 py-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          tx.type === 'deposit' ? 'bg-green-100 text-green-700'
                          : tx.type === 'withdrawal' ? 'bg-orange-100 text-orange-700'
                          : 'bg-blue-100 text-blue-700'
                        }`}>{tx.type}</span>
                        <span className="font-semibold text-[var(--color-ink)]">
                          {tx.is_incoming === false ? '-' : '+'}{formatUnits(BigInt(tx.amount), 6)} USDC
                        </span>
                      </div>
                      {tx.is_sender_hidden
                        ? <p className="text-[var(--color-muted)]">From: [hidden]</p>
                        : tx.sender && <p className="text-[var(--color-muted)] truncate">From: {tx.sender}</p>
                      }
                      {tx.withdraw_status && (
                        <p className="text-[var(--color-muted)]">Status: {tx.withdraw_status}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {panel === 'withdraw' && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--color-muted)]">
                    Withdraw tokens from your private vault back to your wallet.
                  </p>
                  <label className="block text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">
                    Amount
                    <input
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      className="mt-2 w-full rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(0,0,0,0.02)] px-4 py-3 text-base text-[var(--color-ink)]"
                    />
                  </label>
                  <button
                    onClick={handleWithdraw}
                    disabled={loading || !withdrawAmount}
                    className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? 'Processing…' : 'Withdraw'}
                  </button>
                  {withdrawTicket && (
                    <div className="rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.06)] p-3">
                      <p className="text-sm font-semibold text-[#15803d]">Withdrawal initiated ✓</p>
                      <p className="mt-1 break-all text-xs text-[var(--color-muted)]">Ticket: {withdrawTicket}</p>
                    </div>
                  )}
                </div>
              )}

              {panel === 'shielded' && (
                <div className="space-y-3">
                  {savedShieldedAddress ? (
                    <>
                      <div className="rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.06)] p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">Privacy Mode ON</span>
                        </div>
                        <p className="text-xs text-[var(--color-muted)]">Winnings will be sent to your shielded address:</p>
                        <p className="break-all font-mono text-sm font-semibold text-[var(--color-ink)]">{savedShieldedAddress}</p>
                      </div>
                      <p className="text-xs text-[var(--color-muted)]">
                        To change it, generate a new address below and save it.
                      </p>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-[rgba(239,68,68,0.15)] bg-[rgba(239,68,68,0.05)] p-3 text-xs text-[var(--color-muted)]">
                      No shielded address saved. Winnings will be sent to your on-chain address (no privacy).
                    </div>
                  )}

                  <p className="text-sm text-[var(--color-muted)]">
                    Generate a new privacy-preserving shielded address and save it as your payout destination.
                  </p>
                  <button
                    onClick={handleGetShielded}
                    disabled={loading}
                    className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? 'Generating…' : 'Generate New Shielded Address'}
                  </button>
                  {shieldedAddress && (
                    <div className="space-y-2">
                      <div className="rounded-2xl border border-[rgba(0,0,255,0.14)] bg-[rgba(0,0,255,0.04)] p-3">
                        <p className="text-xs text-[var(--color-muted)]">Generated (not saved yet):</p>
                        <p className="mt-1 break-all text-sm font-mono font-semibold text-[var(--color-ink)]">{shieldedAddress}</p>
                      </div>
                      <button
                        onClick={() => handleSaveShieldedAddress(shieldedAddress)}
                        disabled={saving}
                        className="w-full rounded-full bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : '✓ Save as My Payout Address'}
                      </button>
                    </div>
                  )}
                  {privacyModeEnabled && (
                    <button
                      onClick={handleRemovePrivacy}
                      disabled={saving}
                      className="w-full rounded-full border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove Privacy Mode
                    </button>
                  )}
                </div>
              )}
            </div>

            <p className="mt-4 text-center text-[10px] text-[var(--color-muted)]">
              Powered by{' '}
              <a href="https://chain.link/automated-compliance-engine" target="_blank" rel="noopener noreferrer" className="underline">
                Chainlink Automated Compliance Engine (ACE)
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
