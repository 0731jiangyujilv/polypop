import OpenAI from "openai"
import { config } from "../config"

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY })
const MIN_DURATION_SECONDS = 10 * 60
const MAX_DURATION_SECONDS = 7 * 24 * 60 * 60

export interface ParsedBetIntent {
  asset: string | null
  duration: number | null
  durationText: string | null
  confidence: number
  error: string | null
}

const SYSTEM_PROMPT = `You are a bet parser for a multi-side crypto price betting bot. Extract the asset and duration from user messages.

Normalize assets to the format SYMBOL/USD when clear.
Support any valid CoinGecko symbol (not only major coins), for example BTC/USD, ETH/USD, LINK/USD, SOL/USD, VIRTUAL/USD.
Duration range: 10 minutes to 365 days
The user may write in English or Chinese.
Users may express duration as a relative unit ("5m", "1h"), a calendar day ("3.21", "03/21", "2026-03-21"), or natural language ("tomorrow", "明天", "后天").
If the user provides a calendar day or natural-language date without a clock time, interpret it as the same local time-of-day as now.
The user message will include a reference current time. Use that reference time when interpreting target-date phrases such as "tomorrow" or "3.21".

Return a JSON object with these fields:
- asset: normalized trading pair like "BTC/USD", or null if unclear
- duration: duration in seconds, or null. Parse "10m"=600, "1h"=3600, "1d"=86400, "10分钟"=600, "1小时"=3600
- durationText: human readable duration like "5 minutes", or null
- confidence: 0.0 to 1.0 how confident you are in the parse
- error: a brief error message if something is unclear, or null
- If the user's intention to start a game or make predictions is unclear, return false directly.

Examples:
- "BTC 10分钟" → {"asset":"BTC/USD","duration":600,"durationText":"10 minutes","confidence":0.95,"error":null}
- "开盘 LINK 1h" → {"asset":"LINK/USD","duration":3600,"durationText":"1 hour","confidence":0.95,"error":null}
- "virtual 30m" → {"asset":"VIRTUAL/USD","duration":1800,"durationText":"30 minutes","confidence":0.95,"error":null}
- "VIRTUAL in tomorrow" → {"asset":"VIRTUAL/USD","duration":86400,"durationText":"tomorrow","confidence":0.95,"error":null}
- "VIRTUAL in 3.21" → {"asset":"VIRTUAL/USD","duration":172800,"durationText":"3-days","confidence":0.9,"error":null}
- "bet on ETH" → {"asset":"ETH/USD","duration":null,"durationText":null,"confidence":0.5,"error":"Please specify a duration, e.g. 5m, 1h"}
- "BTC" → {"asset":"BTC/USD","duration":null,"durationText":null,"confidence":0.5,"error":"Please specify a duration, e.g. 5m, 1h"}

ONLY return valid JSON. No markdown, no explanation.`

interface DurationHint {
  duration: number | null
  durationText: string | null
  error: string | null
}

function formatReferenceNow(now: Date) {
  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const absMinutes = Math.abs(offsetMinutes)
  const offsetHours = String(Math.floor(absMinutes / 60)).padStart(2, "0")
  const offsetRemainderMinutes = String(absMinutes % 60).padStart(2, "0")

  return [
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
    `UTC${sign}${offsetHours}:${offsetRemainderMinutes}`,
  ].join(" ")
}

function withCurrentLocalTime(target: Date, now: Date) {
  target.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0)
  return target
}

function toWholeSeconds(ms: number) {
  return Math.max(0, Math.round(ms / 1000))
}

function formatMonthDay(month: number, day: number) {
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`
}

function validateDuration(duration: number, label: string): DurationHint {
  if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    return {
      duration: null,
      durationText: label,
      error: `Duration must be between 10 minutes and 365 days. Parsed "${label}" outside that range.`,
    }
  }

  return { duration, durationText: label, error: null }
}

function parseCalendarDuration(message: string, now = new Date()): DurationHint | null {
  const lower = message.toLowerCase()
  const relativePatterns: Array<{ pattern: RegExp; days: number; label: string }> = [
    { pattern: /\b(day after tomorrow)\b/i, days: 2, label: "day after tomorrow" },
    { pattern: /\b(tomorrow)\b/i, days: 1, label: "tomorrow" },
    { pattern: /后天/, days: 2, label: "后天" },
    { pattern: /明天/, days: 1, label: "明天" },
  ]

  for (const item of relativePatterns) {
    if (!item.pattern.test(lower)) continue
    const target = new Date(now)
    target.setDate(target.getDate() + item.days)
    const duration = toWholeSeconds(target.getTime() - now.getTime())
    return validateDuration(duration, item.label)
  }

  const explicitDateMatch = message.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/)
  if (explicitDateMatch) {
    const year = Number(explicitDateMatch[1])
    const month = Number(explicitDateMatch[2])
    const day = Number(explicitDateMatch[3])
    const target = withCurrentLocalTime(new Date(year, month - 1, day), now)
    if (
      target.getFullYear() === year &&
      target.getMonth() === month - 1 &&
      target.getDate() === day
    ) {
      const duration = toWholeSeconds(target.getTime() - now.getTime())
      return validateDuration(duration, `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`)
    }
  }

  const monthDayMatch = message.match(/(?:\bin\s+)?\b(\d{1,2})[./-](\d{1,2})\b/)
  if (monthDayMatch) {
    const month = Number(monthDayMatch[1])
    const day = Number(monthDayMatch[2])
    let year = now.getFullYear()
    let target = withCurrentLocalTime(new Date(year, month - 1, day), now)
    if (
      target.getFullYear() !== year ||
      target.getMonth() !== month - 1 ||
      target.getDate() !== day
    ) {
      return {
        duration: null,
        durationText: formatMonthDay(month, day),
        error: `Could not parse "${formatMonthDay(month, day)}" as a valid date.`,
      }
    }

    if (target.getTime() <= now.getTime()) {
      year += 1
      target = withCurrentLocalTime(new Date(year, month - 1, day), now)
    }

    const duration = toWholeSeconds(target.getTime() - now.getTime())
    return validateDuration(duration, formatMonthDay(month, day))
  }

  return null
}

function mergeDurationHint(parsed: ParsedBetIntent, hint: DurationHint | null): ParsedBetIntent {
  if (!hint) return parsed
  if (hint.error) {
    return {
      ...parsed,
      duration: null,
      durationText: hint.durationText,
      confidence: Math.min(parsed.confidence || 0.8, 0.8),
      error: hint.error,
    }
  }

  return {
    ...parsed,
    duration: hint.duration,
    durationText: hint.durationText,
    confidence: Math.max(parsed.confidence || 0, 0.9),
    error: null,
  }
}

export async function parseBetIntent(message: string): Promise<ParsedBetIntent> {
  const now = new Date()
  const durationHint = parseCalendarDuration(message)

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Reference current time: ${formatReferenceNow(now)}`,
            `Reference current time (ISO): ${now.toISOString()}`,
            `User message: ${message}`,
            durationHint?.duration
              ? `Deterministic duration hint: ${durationHint.duration} seconds (${durationHint.durationText}).`
              : null,
          ].filter(Boolean).join("\n"),
        },
      ],
      temperature: 0.1,
      max_tokens: 200,
    })
    console.log("OpenAI response:", response.choices[0]?.message?.content)

    const content = response.choices[0]?.message?.content?.trim()
    if (!content || content.toLowerCase() === "false") {
      return {
        asset: null, duration: null, durationText: null,
        confidence: 0, error: "No response from AI",
      }
    }

    const parsed = JSON.parse(content) as ParsedBetIntent
    return mergeDurationHint(parsed, durationHint)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const fallback = {
      asset: null, duration: null, durationText: null,
      confidence: 0, error: `Parse error: ${errorMsg}`,
    }
    return mergeDurationHint(fallback, durationHint)
  }
}
