import express from "express"
import cors from "cors"
import { prisma } from "./db"
import { getPriceFeed } from "./services/blockchain"
import { fetchAssetPriceQuote } from "./services/market-data"

export const app = express()
app.use(cors())
app.use(express.json())

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

// Get bet by DB ID
app.get("/api/bet/:id", async (req, res) => {
  try {
    const bet = await prisma.bet.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { positions: true },
    })
    if (!bet) {
      res.status(404).json({ error: "Bet not found" })
      return
    }
    res.json(serializeBet(bet))
  } catch (err) {
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get bet by UUID
app.get("/api/bet/uuid/:uuid", async (req, res) => {
  try {
    const bet = await prisma.bet.findUnique({
      where: { uuid: req.params.uuid },
      include: { positions: true },
    })
    if (!bet) {
      res.status(404).json({ error: "Bet not found" })
      return
    }
    res.json(serializeBet(bet))
  } catch (err) {
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get bet by contract address
app.get("/api/bet/contract/:address", async (req, res) => {
  try {
    const bet = await prisma.bet.findFirst({
      where: { contractAddress: req.params.address },
      include: { positions: true },
    })
    if (!bet) {
      res.status(404).json({ error: "Bet not found" })
      return
    }
    res.json(serializeBet(bet))
  } catch (err) {
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get user's bets
app.get("/api/user/:tgId/bets", async (req, res) => {
  try {
    const tgId = BigInt(req.params.tgId)
    const positions = await prisma.position.findMany({
      where: { tgId },
      select: { betId: true },
    })
    const positionBetIds = positions.map((p) => p.betId)

    const bets = await prisma.bet.findMany({
      where: {
        OR: [
          { creatorTgId: tgId },
          { id: { in: positionBetIds } },
        ],
      },
      include: { positions: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    })
    res.json(bets.map(serializeBet))
  } catch (err) {
    res.status(500).json({ error: "Internal server error" })
  }
})

// Check if asset is supported
app.get("/api/asset/:asset", async (req, res) => {
  try {
    const asset = decodeURIComponent(req.params.asset)
    const oracle = await (prisma as any).oracleRegistry.findUnique({ where: { asset } })
    if (oracle?.isActive) {
      res.json({ asset, supported: true, priceFeed: oracle.oracleAddress, source: "registry" })
      return
    }

    const feed = await getPriceFeed(asset)
    const supported = feed !== "0x0000000000000000000000000000000000000000"
    res.json({ asset, supported, priceFeed: feed, source: "factory" })
  } catch (err) {
    res.status(500).json({ error: "Internal server error" })
  }
})

app.get("/api/price/:asset", async (req, res) => {
  try {
    const asset = decodeURIComponent(req.params.asset)
    const quote = await fetchAssetPriceQuote(asset)
    res.json({
      asset: quote.asset,
      coinGeckoId: quote.coinGeckoId,
      price: quote.price,
      timestamp: Date.now(),
    })
  } catch (err) {
    console.error("price fetch error:", err)
    res.status(500).json({ error: "Failed to fetch price" })
  }
})

app.get("/api/crude-oil-price", async (_req, res) => {
  try {
    const response = await fetch(`https://www.cmegroup.com/CmeWS/mvc/quotes/v2/contracts-by-number?isProtected&_t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/json',
        'origin': 'https://www.cmegroup.com',
        'referer': 'https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.html',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ productIds: ['425'], contractsNumber: [1], type: 'VOLUME', showQuarterly: [0] }),
    })
    if (!response.ok) throw new Error(`CME API error: ${response.status}`)
    const data = await response.json() as Array<{ last?: string, priorSettle?: string }>
    const quote = data?.[0]
    const priceStr = (quote?.last && quote.last !== '-') ? quote.last
      : (quote?.priorSettle && quote.priorSettle !== '-') ? quote.priorSettle
      : null
    if (!priceStr) throw new Error('No price in CME response')
    const price = Number(priceStr)
    if (!Number.isFinite(price)) throw new Error(`Invalid price value: ${priceStr}`)
    res.json({ price: price.toFixed(2), ticks: String(Math.round(price * 100)) })
  } catch (err) {
    console.error('CME price fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch crude oil price' })
  }
})

app.get("/api/oracles", async (_req, res) => {
  try {
    const oracles = await (prisma as any).oracleRegistry.findMany({
      where: { isActive: true },
      orderBy: { asset: "asc" },
    })

    res.json(oracles)
  } catch (error) {
    console.error("oracle list error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Register wallet address for a user (called from WebApp after wallet connect)
app.post("/api/register-wallet", async (req, res) => {
  try {
    const { tgId, walletAddress } = req.body

    if (!tgId || !walletAddress) {
      res.status(400).json({ error: "tgId and walletAddress required" })
      return
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      res.status(400).json({ error: "Invalid wallet address" })
      return
    }

    const tgIdBigInt = BigInt(tgId)

    await prisma.user.upsert({
      where: { tgId: tgIdBigInt },
      update: { walletAddress: walletAddress.toLowerCase() },
      create: { tgId: tgIdBigInt, walletAddress: walletAddress.toLowerCase() },
    })

    res.json({ success: true })
  } catch (err) {
    console.error("register-wallet error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Notify bot that a bet was created on-chain (called from WebApp after createBet tx)
app.post("/api/bet/:id/on-chain-created", async (req, res) => {
  try {
    const betId = parseInt(req.params.id)
    const { contractAddress, onChainBetId, txHash } = req.body

    if (!contractAddress) {
      res.status(400).json({ error: "contractAddress required" })
      return
    }

    const bet = await prisma.bet.findUnique({ where: { id: betId } })
    if (!bet) {
      res.status(404).json({ error: "Bet not found" })
      return
    }

    // If already updated with this onChainBetId, skip (idempotent)
    if (bet.betId !== null && bet.betId === parseInt(onChainBetId || "0")) {
      console.log(`[API] Bet #${betId} already has onChainBetId ${onChainBetId}, skipping update`)
      res.json({ success: true, alreadyUpdated: true })
      return
    }

    // Check if another row already owns this onChainBetId (stale data from old factory)
    const parsedOnChainId = onChainBetId ? parseInt(onChainBetId) : null
    if (parsedOnChainId !== null) {
      const conflict = await prisma.bet.findFirst({
        where: { betId: parsedOnChainId, id: { not: betId } },
      })
      if (conflict) {
        console.warn(`[API] onChainBetId ${parsedOnChainId} already used by DB bet #${conflict.id}, clearing stale row`)
        await prisma.bet.update({
          where: { id: conflict.id },
          data: { betId: null },
        })
      }
    }

    await prisma.bet.update({
      where: { id: betId },
      data: {
        contractAddress,
        betId: parsedOnChainId,
        status: "OPEN",
        txHash,
      },
    })

    res.json({ success: true })
  } catch (err) {
    console.error("on-chain-created error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get overall statistics
app.get("/api/stats", async (_req, res) => {
  try {
    const [totalBets, activeBets, settledBets, cancelledBets, volumeData] = await Promise.all([
      prisma.bet.count(),
      prisma.bet.count({ where: { status: { in: ["OPEN", "LOCKED"] } } }),
      prisma.bet.count({ where: { status: "SETTLED" } }),
      prisma.bet.count({ where: { status: "CANCELLED" } }),
      prisma.position.aggregate({
        _sum: { amount: true },
      }),
    ])

    const totalVolume = volumeData._sum.amount?.toString() || "0"

    res.json({
      activeBetsCount: activeBets,
      totalBetsCount: totalBets,
      totalVolume,
      settledBetsCount: settledBets,
      cancelledBetsCount: cancelledBets,
    })
  } catch (err) {
    console.error("stats error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get leaderboard
app.get("/api/stats/leaderboard", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10

    const settledBets = await prisma.bet.findMany({
      where: { status: "SETTLED" },
      include: { positions: { include: { user: true } } },
    })

    const userStats = new Map<string, {
      username: string
      wins: number
      losses: number
      totalProfit: number
      totalBets: number
    }>()

    for (const bet of settledBets) {
      for (const position of bet.positions) {
        const userId = position.tgId.toString()
        const username = position.user.username || `User${userId.slice(-6)}`
        
        if (!userStats.has(userId)) {
          userStats.set(userId, {
            username,
            wins: 0,
            losses: 0,
            totalProfit: 0,
            totalBets: 0,
          })
        }

        const stats = userStats.get(userId)!
        stats.totalBets++

        const positionAmount = parseFloat(position.amount.toString())
        const totalUp = parseFloat(bet.totalUp.toString())
        const totalDown = parseFloat(bet.totalDown.toString())

        if (bet.isDraw) {
          continue
        }

        const isWinner = position.side === bet.winningSide
        if (isWinner) {
          stats.wins++
          const totalPool = totalUp + totalDown
          const winningPool = position.side === "UP" ? totalUp : totalDown
          const payout = (positionAmount / winningPool) * totalPool
          stats.totalProfit += payout - positionAmount
        } else {
          stats.losses++
          stats.totalProfit -= positionAmount
        }
      }
    }

    const leaderboard = Array.from(userStats.values())
      .map(stats => ({
        username: stats.username,
        wins: stats.wins,
        losses: stats.losses,
        totalProfit: stats.totalProfit.toFixed(6),
        winRate: stats.totalBets > 0 ? (stats.wins / stats.totalBets) * 100 : 0,
        totalBets: stats.totalBets,
      }))
      .sort((a, b) => parseFloat(b.totalProfit) - parseFloat(a.totalProfit))
      .slice(0, limit)

    res.json(leaderboard)
  } catch (err) {
    console.error("leaderboard error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get user privacy settings (shielded address)
app.get("/api/user/privacy/:walletAddress", async (req, res) => {
  const addr = req.params.walletAddress.toLowerCase()
  try {
    const settings = await prisma.userPrivacySettings.findUnique({ where: { walletAddress: addr } })
    res.json({ shieldedAddress: settings?.shieldedAddress ?? null, privacyMode: settings?.privacyMode ?? false })
  } catch (err) {
    res.status(500).json({ error: "Internal server error" })
  }
})

// Save user privacy settings (shielded address)
app.put("/api/user/privacy/:walletAddress", async (req, res) => {
  const addr = req.params.walletAddress.toLowerCase()
  const { shieldedAddress } = req.body as { shieldedAddress?: string }
  if (!shieldedAddress || !/^0x[a-fA-F0-9]{40}$/.test(shieldedAddress)) {
    res.status(400).json({ error: "Valid shieldedAddress required" })
    return
  }
  try {
    await prisma.userPrivacySettings.upsert({
      where: { walletAddress: addr },
      update: { shieldedAddress: shieldedAddress.toLowerCase(), privacyMode: true },
      create: { walletAddress: addr, shieldedAddress: shieldedAddress.toLowerCase(), privacyMode: true },
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete user privacy settings (opt out)
app.delete("/api/user/privacy/:walletAddress", async (req, res) => {
  const addr = req.params.walletAddress.toLowerCase()
  try {
    await prisma.userPrivacySettings.upsert({
      where: { walletAddress: addr },
      update: { shieldedAddress: null, privacyMode: false },
      create: { walletAddress: addr, shieldedAddress: null, privacyMode: false },
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: "Internal server error" })
  }
})

// ── Uniswap Trading API proxy (avoids CORS) ──────────────────────────────────
const UNISWAP_TRADING_API_URL = process.env.UNISWAP_API_URL ?? 'https://trade-api.gateway.uniswap.org/v1'
const UNISWAP_API_KEY = process.env.UNISWAP_API_KEY ?? ''

app.post("/api/uniswap/quote", async (req, res) => {
  try {
    const upstream = await fetch(`${UNISWAP_TRADING_API_URL}/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': UNISWAP_API_KEY,
        'x-universal-router-version': '2.1.1',
      },
      body: JSON.stringify(req.body),
    })
    const text = await upstream.text()
    res.status(upstream.status).type('json').send(text)
  } catch (err) { res.status(502).json({ error: String(err) }) }
})

app.post("/api/uniswap/check_approval", async (req, res) => {
  try {
    const upstream = await fetch(`${UNISWAP_TRADING_API_URL}/check_approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': UNISWAP_API_KEY },
      body: JSON.stringify(req.body),
    })
    const text = await upstream.text()
    res.status(upstream.status).type('json').send(text)
  } catch (err) { res.status(502).json({ error: String(err) }) }
})

app.post("/api/uniswap/swap", async (req, res) => {
  try {
    const upstream = await fetch(`${UNISWAP_TRADING_API_URL}/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': UNISWAP_API_KEY,
        'x-universal-router-version': '2.1.1',
      },
      body: JSON.stringify(req.body),
    })
    const text = await upstream.text()
    res.status(upstream.status).type('json').send(text)
  } catch (err) { res.status(502).json({ error: String(err) }) }
})

app.post("/api/uniswap/order", async (req, res) => {
  try {
    const upstream = await fetch(`${UNISWAP_TRADING_API_URL}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': UNISWAP_API_KEY },
      body: JSON.stringify(req.body),
    })
    const text = await upstream.text()
    res.status(upstream.status).type('json').send(text)
  } catch (err) { res.status(502).json({ error: String(err) }) }
})

// ── ACE API proxy (avoids CORS) ──────────────────────────────────────────────
const ACE_API_URL = process.env.ACE_API_URL ?? 'https://convergence2026-token-api.cldev.cloud'

async function proxyAce(path: string, body: unknown): Promise<Response> {
  return fetch(`${ACE_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

app.post("/api/ace/balances", async (req, res) => {
  try {
    const upstream = await proxyAce('/balances', req.body)
    res.status(upstream.status).json(await upstream.json())
  } catch (err) { res.status(502).json({ error: String(err) }) }
})

app.post("/api/ace/transactions", async (req, res) => {
  try {
    const upstream = await proxyAce('/transactions', req.body)
    res.status(upstream.status).json(await upstream.json())
  } catch (err) { res.status(502).json({ error: String(err) }) }
})

app.post("/api/ace/withdraw", async (req, res) => {
  try {
    const upstream = await proxyAce('/withdraw', req.body)
    res.status(upstream.status).json(await upstream.json())
  } catch (err) { res.status(502).json({ error: String(err) }) }
})

app.post("/api/ace/shielded-address", async (req, res) => {
  try {
    console.log('[ACE proxy] /shielded-address body:', JSON.stringify(req.body))
    const upstream = await proxyAce('/shielded-address', req.body)
    const text = await upstream.text()
    console.log('[ACE proxy] /shielded-address upstream status:', upstream.status, 'body:', text)
    res.status(upstream.status).type('json').send(text)
  } catch (err) { res.status(502).json({ error: String(err) }) }
})

// Serialize BigInt fields for JSON response
function serializeBet(bet: any) {
  const result: any = { ...bet }
  result.source = "telegram"

  // Convert BigInt fields to strings
  if (result.creatorTgId !== undefined) result.creatorTgId = String(result.creatorTgId)
  if (result.chatId !== undefined) result.chatId = String(result.chatId)
  if (result.messageId !== undefined) result.messageId = result.messageId ? String(result.messageId) : null
  if (result.minAmount !== undefined) result.minAmount = String(result.minAmount)
  if (result.maxAmount !== undefined) result.maxAmount = String(result.maxAmount)
  if (result.totalUp !== undefined) result.totalUp = String(result.totalUp)
  if (result.totalDown !== undefined) result.totalDown = String(result.totalDown)

  // Serialize positions
  if (result.positions) {
    result.positions = result.positions.map((p: any) => ({
      ...p,
      tgId: String(p.tgId),
      amount: String(p.amount),
    }))
  }

  return result
}

function serializeXProposal(proposal: any) {
  return {
    id: proposal.id,
    uuid: proposal.uuid,
    asset: proposal.asset,
    minAmount: proposal.minAmount.toString(),
    maxAmount: proposal.maxAmount.toString(),
    duration: proposal.duration,
    contractAddress: proposal.contractAddress,
    creatorTgId: proposal.creatorXUserId,
    source: "x",
  }
}

app.get("/api/x/bet/uuid/:uuid", async (req, res) => {
  try {
    const proposal = await prisma.xProposal.findUnique({ where: { uuid: req.params.uuid } })
    if (!proposal) {
      res.status(404).json({ error: "Proposal not found" })
      return
    }

    res.json(serializeXProposal(proposal))
  } catch (err) {
    console.error("x proposal fetch error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

app.get("/api/x/bet/:id", async (req, res) => {
  try {
    const proposal = await prisma.xProposal.findUnique({ where: { id: Number(req.params.id) } })
    if (!proposal) {
      res.status(404).json({ error: "Proposal not found" })
      return
    }

    res.json(serializeXProposal(proposal))
  } catch (err) {
    console.error("x proposal fetch error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

app.post("/api/x/register-wallet", async (req, res) => {
  try {
    const { tgId, walletAddress } = req.body as { tgId?: string; walletAddress?: string }
    if (!tgId || !walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      res.status(400).json({ error: "tgId and valid walletAddress required" })
      return
    }

    const xUser = await prisma.xUser.upsert({
      where: { xUserId: String(tgId) },
      update: { walletAddress: walletAddress.toLowerCase() },
      create: { xUserId: String(tgId), walletAddress: walletAddress.toLowerCase() },
    })

    await prisma.xProposal.updateMany({
      where: { creatorXUserId: xUser.xUserId, creatorWallet: null },
      data: { creatorWallet: walletAddress.toLowerCase() },
    })

    res.json({ success: true })
  } catch (err) {
    console.error("x register-wallet error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

app.post("/api/x/bet/:id/on-chain-created", async (req, res) => {
  try {
    const proposalId = Number(req.params.id)
    const { contractAddress, onChainBetId, txHash } = req.body as {
      contractAddress?: string
      onChainBetId?: string | number
      txHash?: string
    }

    if (!contractAddress) {
      res.status(400).json({ error: "contractAddress required" })
      return
    }

    const proposal = await prisma.xProposal.findUnique({ where: { id: proposalId } })
    if (!proposal) {
      res.status(404).json({ error: "Proposal not found" })
      return
    }

    await prisma.xProposal.update({
      where: { id: proposalId },
      data: {
        contractAddress,
        onChainBetId: onChainBetId === undefined ? null : Number(onChainBetId),
        txHash: txHash || null,
        status: "OPEN",
      },
    })

    res.json({ success: true })
  } catch (err) {
    console.error("x on-chain-created error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})
