import { app } from "./common/api"
import { config } from "./common/config"
import { prisma } from "./common/db"

async function main() {
  app.listen(config.PORT, () => {
    console.log(`📡 Service API listening on port ${config.PORT}`)
  })

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down service...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (err) => {
  console.error("Service fatal error:", err)
  await prisma.$disconnect()
  process.exit(1)
})
