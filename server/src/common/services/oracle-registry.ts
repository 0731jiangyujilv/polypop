import { prisma } from "../db"

function normalizeAssetPair(asset: string): string {
  return asset.trim().toUpperCase()
}

export async function isAssetSupported(asset: string): Promise<boolean> {
  const normalizedAsset = normalizeAssetPair(asset)
  const oracle = await (prisma as any).oracleRegistry.findUnique({
    where: { asset: normalizedAsset },
    select: { isActive: true },
  })

  return Boolean(oracle?.isActive)
}

export async function listSupportedAssets(): Promise<string[]> {
  const rows = await (prisma as any).oracleRegistry.findMany({
    where: { isActive: true },
    orderBy: { asset: "asc" },
    select: { asset: true },
  }) as Array<{ asset: string }>

  return rows.map((row) => row.asset)
}
