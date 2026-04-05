export const BET_FACTORY_ADDRESS = (import.meta.env.VITE_BET_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`
export const BET_POR_ADDRESS = (import.meta.env.VITE_BET_POR_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`
export const BINARY_MARKET_FACTORY_ADDRESS = (import.meta.env.VITE_BINARY_MARKET_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`
export const MARKET_USDC_ADDRESS = (import.meta.env.VITE_MARKET_USDC_ADDRESS || '0x3600000000000000000000000000000000000000') as `0x${string}`
export const SOURCE_USDC_ADDRESS = (import.meta.env.VITE_SOURCE_USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48') as `0x${string}`
export const BRIDGE_SOURCE_USDC_ADDRESS = (import.meta.env.VITE_BRIDGE_SOURCE_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e') as `0x${string}`
export const USDC_ADDRESS = MARKET_USDC_ADDRESS

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
] as const

export const BET_FACTORY_ABI = [
  {
    type: 'function',
    name: 'createBet',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minAmount', type: 'uint256' },
      { name: 'maxAmount', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'asset', type: 'string' },
      { name: 'initiatorSide', type: 'uint8' },
      { name: 'initiatorAmount', type: 'uint256' },
    ],
    outputs: [
      { name: 'betId', type: 'uint256' },
      { name: 'betContract', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getBet',
    inputs: [{ name: 'betId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBetCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'BetCreated',
    inputs: [
      { name: 'betId', type: 'uint256', indexed: true },
      { name: 'betContract', type: 'address', indexed: false },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'asset', type: 'string', indexed: false },
    ],
  },
] as const

export const BINARY_MARKET_FACTORY_ABI = [
  {
    type: 'function',
    name: 'createMarket',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minAmount', type: 'uint256' },
      { name: 'maxAmount', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'initiatorOutcome', type: 'uint8' },
      { name: 'initiatorAmount', type: 'uint256' },
    ],
    outputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'marketAddress', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getMarket',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'DEFAULT_QUESTION',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'minDuration',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'MarketCreated',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'market', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
    ],
  },
] as const

export const BET_ABI = [
  {
    type: 'function',
    name: 'placeBet',
    inputs: [
      { name: 'side', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claim',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimFor',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'status',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBetInfo',
    inputs: [],
    outputs: [
      {
        name: 'info',
        type: 'tuple',
        components: [
          { name: 'creator', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'minAmount', type: 'uint256' },
          { name: 'maxAmount', type: 'uint256' },
          { name: 'duration', type: 'uint256' },
          { name: 'bettingDeadline', type: 'uint256' },
          { name: 'priceFeed', type: 'address' },
          { name: 'startPrice', type: 'int256' },
          { name: 'endPrice', type: 'int256' },
          { name: 'startTime', type: 'uint256' },
          { name: 'endTime', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'winningSide', type: 'uint8' },
          { name: 'isDraw', type: 'bool' },
          { name: 'totalUp', type: 'uint256' },
          { name: 'totalDown', type: 'uint256' },
          { name: 'prizePool', type: 'uint256' },
          { name: 'feeBps', type: 'uint256' },
          { name: 'feeRecipient', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUpPositions',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'player', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDownPositions',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'player', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'claimable',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hasClaimed',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

export const BINARY_MARKET_ABI = [
  {
    type: 'function',
    name: 'placePrediction',
    inputs: [
      { name: 'outcome', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claim',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimable',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hasClaimed',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMarketInfo',
    inputs: [],
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
  },
  {
    type: 'function',
    name: 'getYesPositions',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'player', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getNoPositions',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'player', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const

export const BetStatus = {
  Open: 0,
  Locked: 1,
  Settled: 2,
} as const

export const Side = {
  Up: 0,
  Down: 1,
} as const

export const BinaryMarketStatus = {
  Open: 0,
  Locked: 1,
  Resolved: 2,
  Cancelled: 3,
} as const

export const BinaryOutcome = {
  No: 0,
  Yes: 1,
} as const

export function binaryMarketStatusLabel(status: number): string {
  switch (status) {
    case BinaryMarketStatus.Open: return 'Open For Predictions'
    case BinaryMarketStatus.Locked: return 'Awaiting Resolution'
    case BinaryMarketStatus.Resolved: return 'Resolved'
    case BinaryMarketStatus.Cancelled: return 'Cancelled'
    default: return 'Unknown'
  }
}

export function betStatusLabel(status: number): string {
  switch (status) {
    case BetStatus.Open: return 'Open for Predictions'
    case BetStatus.Locked: return 'Locked'
    case BetStatus.Settled: return 'Settled'
    default: return 'Unknown'
  }
}

export const BET_POR_ABI = [
  {
    type: 'function',
    name: 'getLatestReport',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'totalBets', type: 'uint256' },
          { name: 'activeBets', type: 'uint256' },
          { name: 'settledBets', type: 'uint256' },
          { name: 'totalVolume', type: 'uint256' },
          { name: 'topPlayerProfit', type: 'uint256' },
          { name: 'isValid', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'reportCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const
