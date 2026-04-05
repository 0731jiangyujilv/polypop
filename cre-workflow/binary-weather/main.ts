import {
  Runner,
  Runtime,
  NodeRuntime,
  handler,
  CronCapability,
  CronPayload,
  HTTPClient,
  EVMClient,
  getNetwork,
  TxStatus,
  encodeCallMsg,
  hexToBase64,
} from '@chainlink/cre-sdk'
import {
  Address,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  Hex,
  parseAbiParameters,
  toHex,
  zeroAddress,
} from 'viem'

interface Config {
  schedule: string
  cmeApiUrl: string
  evms: Array<{
    marketFactoryAddress: string
    chainSelectorName: string
    isTestnet: boolean
    gasLimit: string
  }>
}

interface MarketSummary {
  id: bigint
  address: string
  status: number
  bettingDeadline: bigint
  endTime: bigint
}

interface CmeQuote {
  last?: {
    ticks?: string
    value?: string
  }
  priorSettle?: {
    ticks?: string
    value?: string
  }
}

interface CmePriceResponse {
  quotes?: CmeQuote[]
}

interface DecodedMarketInfo {
  creator: string
  token: string
  question: string
  minAmount: bigint
  maxAmount: bigint
  duration: bigint
  bettingDeadline: bigint
  startTime: bigint
  endTime: bigint
  status: number
  resolvedOutcome: number
  isDraw: boolean
  totalYes: bigint
  totalNo: bigint
  prizePool: bigint
  feeBps: bigint
  feeRecipient: string
}

const FACTORY_ABI = [
  {
    inputs: [],
    name: 'getMarketCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'getMarket',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKET_ABI = [
  {
    inputs: [],
    name: 'getMarketInfo',
    outputs: [
      {
        name: 'info',
        type: 'tuple',
        components: [
          { name: 'creator', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'question', type: 'string' },
          { name: 'minAmount', type: 'uint256' },
          { name: 'maxAmount', type: 'uint256' },
          { name: 'duration', type: 'uint256' },
          { name: 'bettingDeadline', type: 'uint256' },
          { name: 'startTime', type: 'uint256' },
          { name: 'endTime', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'resolvedOutcome', type: 'uint8' },
          { name: 'isDraw', type: 'bool' },
          { name: 'totalYes', type: 'uint256' },
          { name: 'totalNo', type: 'uint256' },
          { name: 'prizePool', type: 'uint256' },
          { name: 'feeBps', type: 'uint256' },
          { name: 'feeRecipient', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'startPriceTicks',
    outputs: [{ name: '', type: 'int256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKET_STATUS_OPEN = 0
const MARKET_STATUS_LOCKED = 1
const ACTION_LOCK = 0
const ACTION_RESOLVE = 1

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}

const initWorkflow = (config: Config) => {
  const cronTrigger = new CronCapability()

  return [
    handler(
      cronTrigger.trigger({
        schedule: config.schedule,
      }),
      onCronTrigger
    ),
  ]
}

const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
  if (!payload.scheduledExecutionTime) {
    throw new Error('Scheduled execution time is required')
  }

  const evmConfig = runtime.config.evms[0]
  const network = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: evmConfig.chainSelectorName,
    isTestnet: evmConfig.isTestnet,
  })

  if (!network) {
    throw new Error(`Network not found: ${evmConfig.chainSelectorName}`)
  }

  const evmClient = new EVMClient(network.chainSelector.selector)
  const marketCount = getMarketCount(runtime, evmClient, evmConfig.marketFactoryAddress)
  runtime.log(`Found ${marketCount.toString()} binary markets`)

  const summaries: MarketSummary[] = []
  for (let i = 0n; i < marketCount; i++) {
    const marketAddress = getMarketAddress(runtime, evmClient, evmConfig.marketFactoryAddress, i)
    const info = getMarketInfo(runtime, evmClient, marketAddress)

    summaries.push({
      id: i,
      address: marketAddress,
      status: Number(info.status),
      bettingDeadline: info.bettingDeadline,
      endTime: info.endTime,
    })
  }

  const now = BigInt(Math.floor(Date.now() / 1000))
  const currentPriceTicks = getCrudeOilPriceTicks(runtime)

  const actions: string[] = []

  for (const market of summaries) {
    if (market.status === MARKET_STATUS_OPEN && now >= market.bettingDeadline) {
      const txHash = writeMarketReport(runtime, evmClient, market.address, evmConfig.gasLimit, ACTION_LOCK, 0, currentPriceTicks)
      actions.push(`lock#${market.id.toString()}@${currentPriceTicks}ticks:${txHash}`)
      continue
    }

    if (market.status === MARKET_STATUS_LOCKED && market.endTime > 0n && now >= market.endTime) {
      const startPriceTicks = getStartPriceTicks(runtime, evmClient, market.address)
      const outcome = currentPriceTicks > startPriceTicks ? 1 : 0
      runtime.log(
        `Market ${market.id.toString()}: startPrice=${startPriceTicks} currentPrice=${currentPriceTicks} -> outcome=${outcome === 1 ? 'UP' : 'DOWN'}`
      )
      const txHash = writeMarketReport(runtime, evmClient, market.address, evmConfig.gasLimit, ACTION_RESOLVE, outcome, currentPriceTicks)
      actions.push(`resolve#${market.id.toString()}=${outcome === 1 ? 'UP' : 'DOWN'}:${txHash}`)
    }
  }

  if (actions.length === 0) {
    runtime.log('No markets required lock or resolve in this run')
    return 'No actions executed'
  }

  return actions.join(' | ')
}

const getMarketCount = (runtime: Runtime<Config>, evmClient: EVMClient, factoryAddress: string): bigint => {
  const callData = encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: 'getMarketCount',
    args: [],
  })

  const result = evmClient.callContract(runtime, {
    call: encodeCallMsg({
      from: zeroAddress,
      to: factoryAddress as Address,
      data: callData as Hex,
    }),
  }).result()

  if (!result.data || result.data.length === 0) {
    throw new Error('getMarketCount returned no data')
  }

  return decodeFunctionResult({
    abi: FACTORY_ABI,
    functionName: 'getMarketCount',
    data: toHex(result.data),
  }) as bigint
}

const getMarketAddress = (
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  factoryAddress: string,
  marketId: bigint
): string => {
  const callData = encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: 'getMarket',
    args: [marketId],
  })

  const result = evmClient.callContract(runtime, {
    call: encodeCallMsg({
      from: zeroAddress,
      to: factoryAddress as Address,
      data: callData as Hex,
    }),
  }).result()

  if (!result.data || result.data.length === 0) {
    throw new Error(`getMarket returned no data for market ${marketId.toString()}`)
  }

  return decodeFunctionResult({
    abi: FACTORY_ABI,
    functionName: 'getMarket',
    data: toHex(result.data),
  }) as string
}

const getMarketInfo = (runtime: Runtime<Config>, evmClient: EVMClient, marketAddress: string): DecodedMarketInfo => {
  const callData = encodeFunctionData({
    abi: MARKET_ABI,
    functionName: 'getMarketInfo',
    args: [],
  })

  const result = evmClient.callContract(runtime, {
    call: encodeCallMsg({
      from: zeroAddress,
      to: marketAddress as Address,
      data: callData as Hex,
    }),
  }).result()

  if (!result.data || result.data.length === 0) {
    throw new Error(`getMarketInfo returned no data for ${marketAddress}`)
  }

  return decodeFunctionResult({
    abi: MARKET_ABI,
    functionName: 'getMarketInfo',
    data: toHex(result.data),
  }) as DecodedMarketInfo
}

const getStartPriceTicks = (runtime: Runtime<Config>, evmClient: EVMClient, marketAddress: string): bigint => {
  const callData = encodeFunctionData({
    abi: MARKET_ABI,
    functionName: 'startPriceTicks',
    args: [],
  })

  const result = evmClient.callContract(runtime, {
    call: encodeCallMsg({
      from: zeroAddress,
      to: marketAddress as Address,
      data: callData as Hex,
    }),
  }).result()

  if (!result.data || result.data.length === 0) {
    throw new Error(`startPriceTicks returned no data for ${marketAddress}`)
  }

  return decodeFunctionResult({
    abi: MARKET_ABI,
    functionName: 'startPriceTicks',
    data: toHex(result.data),
  }) as bigint
}

const getCrudeOilPriceTicks = (runtime: Runtime<Config>): bigint => {
  const httpClient = new HTTPClient()
  runtime.log(`Fetching crude oil price from arc.polypop.club`)

  const response = httpClient.sendRequest(runtime as unknown as NodeRuntime<Config>, {
    method: 'GET',
    url: 'https://arc.polypop.club/api/crude-oil-price',
    headers: {
      'accept': '*/*',
    },
  }).result()

  if (response.statusCode !== 200) {
    throw new Error(`Crude oil price API failed with status ${response.statusCode}`)
  }

  const data = JSON.parse(Buffer.from(response.body).toString('utf-8')) as { price: string; ticks: string }

  if (!data.ticks) {
    throw new Error('Crude oil price API response did not include ticks')
  }

  const ticks = BigInt(data.ticks) + 1n
  runtime.log(`Crude oil (WTI) price: ${ticks} ticks ($${data.price}/barrel, +1 tick applied)`)
  return ticks
}

const writeMarketReport = (
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  marketAddress: string,
  gasLimit: string,
  action: number,
  outcome: number,
  priceTicks: bigint
): string => {
  const reportData = encodeAbiParameters(
    parseAbiParameters('uint8 action, uint8 outcome, int256 priceTicks'),
    [action, outcome, priceTicks]
  )

  const reportResponse = runtime.report({
    encodedPayload: hexToBase64(reportData),
    encoderName: 'evm',
    signingAlgo: 'ecdsa',
    hashingAlgo: 'keccak256',
  }).result()

  const writeResult = evmClient.writeReport(runtime, {
    receiver: marketAddress,
    report: reportResponse,
    gasConfig: {
      gasLimit,
    },
  }).result()

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`Failed to write market report for ${marketAddress}: ${writeResult.errorMessage || writeResult.txStatus}`)
  }

  const txHash = writeResult.txHash
    ? toHex(writeResult.txHash)
    : '0x0000000000000000000000000000000000000000000000000000000000000000'

  runtime.log(`Wrote report to ${marketAddress}: action=${action}, outcome=${outcome}, priceTicks=${priceTicks}, tx=${txHash}`)
  return txHash
}
