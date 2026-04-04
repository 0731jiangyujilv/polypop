import { useState, useCallback } from 'react'
import { AppKit } from '@circle-fin/app-kit'
import { createAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { useAccount } from 'wagmi'

export type BridgeStep = 'idle' | 'processing' | 'done' | 'error'

const SOURCE_BRIDGE_CHAIN = 'Base_Sepolia'
const TARGET_BRIDGE_CHAIN = 'Arc_Testnet'

export function useBridgeUSDC() {
  const { connector, isConnected } = useAccount()
  const [step, setStep] = useState<BridgeStep>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const bridge = useCallback(
    async (amount: string) => {
      if (!isConnected || !connector) {
        setStep('error')
        setErrorMsg('Connect your wallet first')
        return
      }

      try {
        setStep('processing')
        setErrorMsg('')
        setTxHash(null)

        const provider = await connector.getProvider()
        if (!provider) throw new Error('Could not get wallet provider')

        const adapter = await createAdapterFromProvider({ provider: provider as never })
        const kit = new AppKit()

        const result = await kit.bridge({
          from: { adapter, chain: SOURCE_BRIDGE_CHAIN as never },
          to: { adapter, chain: TARGET_BRIDGE_CHAIN as never },
          amount,
        })

        const steps = ((result as unknown as Record<string, unknown>)?.steps ?? []) as Array<{ txHash?: string }>
        const lastTx = [...steps].reverse().find((s) => s.txHash)
        setTxHash(lastTx?.txHash ?? null)
        setStep('done')
      } catch (err) {
        setStep('error')
        setErrorMsg(
          err instanceof Error ? err.message.slice(0, 200) : 'Bridge failed. Please try again.'
        )
      }
    },
    [connector, isConnected]
  )

  const reset = useCallback(() => {
    setStep('idle')
    setErrorMsg('')
    setTxHash(null)
  }, [])

  return { step, txHash, errorMsg, bridge, reset, isReady: isConnected && !!connector }
}
