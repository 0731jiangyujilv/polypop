import { prisma } from "../common/db"
import { config, publicWebappUrl } from "../common/config"
import { parseBetIntent } from "../common/services/openai"
import { isAssetSupported } from "../common/services/oracle-registry"
import { createTweet, fetchMentions } from "./x-api"

function formatDuration(seconds: number) {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

function stripBotMention(text: string) {
  const username = config.BOT_X_USERNAME.replace(/^@/, "")
  return text.replace(new RegExp(`@${username}`, "ig"), "").trim()
}

function proposalTweetText(input: {
  username?: string
  asset: string
  duration: number
  uuid: string
}) {
  const createUrl = `${publicWebappUrl}/create/${input.uuid}?source=x`
  const creator = input.username ? `@${input.username}` : "you"

  return [
    `Your ${input.asset} ${formatDuration(input.duration)} price-direction market is ready.`,
    `Launch it on Base here: ${createUrl}`,
    // `Fee: 1% total. The market creator receives 30% of that fee.`,
    // `After deployment, share the prediction link on X. The bot will monitor the contract and post follow-ups.`
  ].join("\n")
}

function invalidIntentTweet(error: string) {
  return [
    "I could not create a valid market from that request.",
    error,
    "Example: @bot BTC 5m, @bot LINK in tomorrow, or @bot virtual in 3.21"
  ].join("\n")
}

export async function pollMentions() {
  const cursor = await prisma.cursor.findUnique({ where: { key: "last_mention_id" } })
  const mentions = await fetchMentions(cursor?.value)
  if (mentions.length === 0) return

  const sortedMentions = mentions.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))

  for (const mention of sortedMentions) {
    const existing = await prisma.xProposal.findUnique({ where: { tweetId: mention.id } })
    if (existing) {
      await upsertMentionCursor(mention.id)
      continue
    }

    const cleaned = stripBotMention(mention.text)
    console.debug(`Processing mention ${mention.id} from @${mention.author.username}: "${cleaned}"`)
    const intent = await parseBetIntent(cleaned)
    console.debug(`Parsed intent for mention ${mention.id}:`, intent)

    const xUser = await prisma.xUser.upsert({
      where: { xUserId: mention.author.id },
      update: { username: mention.author.username || null },
      create: {
        xUserId: mention.author.id,
        username: mention.author.username || null,
      },
    })

    if (intent.confidence < 0.5 || !intent.asset || !intent.duration) {
      // If the user's intention is unclear, we can choose to ignore it instead of replying with an error. This reduces noise and avoids spamming users who might just be mentioning the bot casually.
      continue;
      await createTweet({
        text: invalidIntentTweet(intent.error || "Please include both an asset and a duration."),
        replyToTweetId: mention.id,
      })
      await upsertMentionCursor(mention.id)
      continue
    }

    if (!(await isAssetSupported(intent.asset))) {
      await createTweet({
        text: `${intent.asset} is not supported yet. Coming soon.`,
        replyToTweetId: mention.id,
      })
      await upsertMentionCursor(mention.id)
      continue
    }

    const proposal = await prisma.xProposal.create({
      data: {
        tweetId: mention.id,
        conversationId: mention.conversationId || mention.id,
        creatorXUserId: mention.author.id,
        creatorUsername: mention.author.username || null,
        creatorWallet: xUser.walletAddress,
        asset: intent.asset,
        duration: intent.duration,
        minAmount: config.DEFAULT_MIN_AMOUNT,
        maxAmount: config.DEFAULT_MAX_AMOUNT,
      },
    })

    const reply = await createTweet({
      text: proposalTweetText({
        username: mention.author.username,
        asset: proposal.asset,
        duration: proposal.duration,
        uuid: proposal.uuid,
      }),
      replyToTweetId: mention.id,
    })

    await prisma.xProposal.update({
      where: { id: proposal.id },
      data: { proposalReplyTweetId: reply.id },
    })

    await upsertMentionCursor(mention.id)
  }
}

async function upsertMentionCursor(value: string) {
  await prisma.cursor.upsert({
    where: { key: "last_mention_id" },
    update: { value },
    create: { key: "last_mention_id", value },
  })
}
