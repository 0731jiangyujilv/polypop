# Webapp

The webapp now assumes:

- markets are deployed on `Arc Testnet`
- `Base Sepolia` is a source-funds chain for USDC bridging
- users bridge first, then approve and join on Arc

## Required env vars

```bash
VITE_WALLETCONNECT_PROJECT_ID=
VITE_BOT_API_URL=
VITE_BET_FACTORY_ADDRESS=
VITE_BET_POR_CONTRACT_ADDRESS=
VITE_BINARY_MARKET_FACTORY_ADDRESS=
VITE_MARKET_USDC_ADDRESS=
VITE_SOURCE_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
VITE_ARC_BRIDGE_URL=
```

## Notes

- `VITE_MARKET_USDC_ADDRESS` should point to the Arc-side USDC contract used by the market.
- `VITE_BINARY_MARKET_FACTORY_ADDRESS` should point to the new Arc-side binary weather market factory.
- `VITE_SOURCE_USDC_ADDRESS` defaults to Base Sepolia USDC.
- `VITE_ARC_BRIDGE_URL` is an optional bridge entrypoint. If unset, the UI falls back to Arc App Kit docs.
- The current frontend is structured for the Bridge Kit / App Kit flow, but it does not embed the Arc SDK directly yet.
