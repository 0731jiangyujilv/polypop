import { BetStatus, betStatusLabel } from '@/config/contracts'
import { shortenAddress, formatUsdc, formatDuration } from '@/lib/utils'

interface BetCardProps {
  participant1: string
  participant2: string
  amount: bigint
  duration: bigint
  status: number
  asset?: string
  startPrice?: bigint
  endPrice?: bigint
  endTime?: bigint
  winner?: string
  p1Deposited: boolean
  p2Deposited: boolean
  currentAddress?: string
}

export function BetCard({
  participant1,
  participant2,
  amount,
  duration,
  status,
  startPrice,
  endPrice,
  endTime,
  winner,
  p1Deposited,
  p2Deposited,
  currentAddress,
}: BetCardProps) {
  const isP1 = currentAddress?.toLowerCase() === participant1.toLowerCase()
  const isP2 = currentAddress?.toLowerCase() === participant2.toLowerCase()
  const isParticipant = isP1 || isP2

  const statusColor =
    status === BetStatus.Open ? 'text-yellow-400' :
    status === BetStatus.Locked ? 'text-blue-400' :
    status === BetStatus.Settled ? 'text-green-400' :
    'text-red-400'

  return (
    <div className="rounded-2xl bg-tg-section-bg p-4 space-y-3">
      {/* Status badge */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${statusColor}`}>
          {betStatusLabel(status)}
        </span>
        {isParticipant && (
          <span className="text-xs bg-tg-button/20 text-tg-button px-2 py-0.5 rounded-full">
            {isP1 ? '📈 UP (You)' : '📉 DOWN (You)'}
          </span>
        )}
      </div>

      {/* Players */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span>
            📈 {shortenAddress(participant1)}
            {isP1 && <span className="ml-1 text-tg-hint">(you)</span>}
          </span>
          <span>{p1Deposited ? '✅' : '⏳'}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>
            📉 {shortenAddress(participant2)}
            {isP2 && <span className="ml-1 text-tg-hint">(you)</span>}
          </span>
          <span>{p2Deposited ? '✅' : '⏳'}</span>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs text-tg-hint">
        <div>💰 {formatUsdc(amount)} USDC each</div>
        <div>⏱ {formatDuration(Number(duration))}</div>
        {startPrice !== undefined && startPrice > 0n && (
          <div>📊 Start: ${(Number(startPrice) / 1e8).toFixed(2)}</div>
        )}
        {endPrice !== undefined && endPrice > 0n && (
          <div>🏁 End: ${(Number(endPrice) / 1e8).toFixed(2)}</div>
        )}
      </div>

      {/* End time countdown */}
      {status === BetStatus.Locked && endTime !== undefined && endTime > 0n && (
        <div className="text-xs text-center text-tg-hint">
          ⏰ Settles: {new Date(Number(endTime) * 1000).toLocaleString()}
        </div>
      )}

      {/* Winner */}
      {status === BetStatus.Settled && winner && winner !== '0x0000000000000000000000000000000000000000' && (
        <div className="text-center text-sm font-bold text-green-400">
          🏆 Winner: {shortenAddress(winner)}
          {winner.toLowerCase() === currentAddress?.toLowerCase() && ' (You!)'}
        </div>
      )}
      {status === BetStatus.Settled && winner === '0x0000000000000000000000000000000000000000' && (
        <div className="text-center text-sm font-bold text-yellow-400">
          🤝 Tie — Both Refunded
        </div>
      )}
    </div>
  )
}
