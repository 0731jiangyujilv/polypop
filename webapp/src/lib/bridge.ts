const ARC_BRIDGE_APP_URL = import.meta.env.VITE_ARC_BRIDGE_URL || ''
const ARC_BRIDGE_DOCS_URL = 'https://docs.arc.network/app-kit'

export function getArcBridgeUrl(amount?: string) {
  if (!ARC_BRIDGE_APP_URL) return ARC_BRIDGE_DOCS_URL

  try {
    const url = new URL(ARC_BRIDGE_APP_URL)
    if (amount) {
      url.searchParams.set('amount', amount)
    }
    return url.toString()
  } catch {
    return ARC_BRIDGE_APP_URL
  }
}

export function hasArcBridgeUrl() {
  return ARC_BRIDGE_APP_URL.length > 0
}
