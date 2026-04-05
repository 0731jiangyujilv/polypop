# PolyPOP

PolyPOP turns live disagreement into prediction markets on X.
When users are already arguing, debating with friends, or seeing two clear sides to a question, they can tag @_PolyPOP to deploy an onchain prediction market directly from the conversation.

## Links

- X / Twitter: [@_PolyPOP](https://x.com/_PolyPOP)
- Demo: [ETHGlobal](https://ethglobal.com/showcase/polypop-qjuge)


## Dependencies

- Arc: liquidity hub / advanced stablecoin logic / crosschain settlement / app-kit
- Uniswap: API routing + bootstrap liquidity demo on Base 
- Chainlink: onchain state-changing settlement flow, ACE Engine, compliant private token transfer


## Design
![Design](./images/polypop_architecture.svg)


## Architecture Overview

```
X Conversation → @_PolyPOP → Uniswap Routing → Arc App-Kit → Arc Market → Chainlink Settlement → Privacy Treasury
```

## Arc App-Kit Integration

The Arc App-Kit provides the following features:
- Market creation and management
- Liquidity provision
- Settlement logic
- Cross-chain support


## Uniswap Integration

- Uniswap provides API routing and trading API on eth mainnet

## Chainlink Integration

- Chainlink cre workflow
- ACE Engine.
- Compliant private token transfer.

## Main Files

### Arc App-Kit (Prediction Market / Settlement / Cross-chain)
- [`contracts/src/BinaryPredictionMarket.sol`](./contracts/src/BinaryPredictionMarket.sol) — core prediction market contract
- [`contracts/src/BinaryPredictionMarketFactory.sol`](./contracts/src/BinaryPredictionMarketFactory.sol) — market factory contract
- [`contracts/src/interfaces/IBinaryPredictionMarket.sol`](./contracts/src/interfaces/IBinaryPredictionMarket.sol) — market interface
- [`contracts/src/interfaces/ReceiverTemplate.sol`](./contracts/src/interfaces/ReceiverTemplate.sol) — cross-chain receiver template
- [`contracts/src/interfaces/IReceiver.sol`](./contracts/src/interfaces/IReceiver.sol) — cross-chain receiver interface
- [`server/src/common/services/settlement.ts`](./server/src/common/services/settlement.ts) — settlement logic
- [`server/src/common/services/claim.ts`](./server/src/common/services/claim.ts) — claim logic
- [`server/src/common/services/bet-listener.ts`](./server/src/common/services/bet-listener.ts) — bet event listener
- [`server/src/common/services/market-data.ts`](./server/src/common/services/market-data.ts) — market data service
- [`webapp/src/lib/bridge.ts`](./webapp/src/lib/bridge.ts) — cross-chain bridge calls
- [`webapp/src/pages/CreatePredictionPage.tsx`](./webapp/src/pages/CreatePredictionPage.tsx) / [`HackathonCreatePage.tsx`](./webapp/src/pages/HackathonCreatePage.tsx) — market creation pages
- [`webapp/src/pages/MarketPage.tsx`](./webapp/src/pages/MarketPage.tsx) / [`HackathonMarketPage.tsx`](./webapp/src/pages/HackathonMarketPage.tsx) — market pages
- [`webapp/src/pages/BetPage.tsx`](./webapp/src/pages/BetPage.tsx) — betting page

### Uniswap (Swap / Trade Routing)
- [`webapp/src/lib/uniswap.ts`](./webapp/src/lib/uniswap.ts) — Uniswap integration utilities
- [`webapp/src/lib/uniswapApi.ts`](./webapp/src/lib/uniswapApi.ts) — Uniswap API routing wrapper
- [`webapp/src/pages/SwapPage.tsx`](./webapp/src/pages/SwapPage.tsx) — swap page

### Chainlink (CRE Workflow / ACE Engine / Compliant Private Transfer)
- [`cre-workflow/binary-weather/main.ts`](./cre-workflow/binary-weather/main.ts) — CRE workflow main logic
- [`cre-workflow/binary-weather/workflow.yaml`](./cre-workflow/binary-weather/workflow.yaml) — CRE workflow config
- [`cre-workflow/project.yaml`](./cre-workflow/project.yaml) — CRE project config
- [`server/src/ace-worker.ts`](./server/src/ace-worker.ts) — ACE Engine worker
- [`server/src/common/aceApi.ts`](./server/src/common/aceApi.ts) — ACE API (server-side)
- [`webapp/src/lib/aceApi.ts`](./webapp/src/lib/aceApi.ts) — ACE API (client-side)
- [`webapp/src/pages/AceClaimPage.tsx`](./webapp/src/pages/AceClaimPage.tsx) — ACE compliant transfer claim page
- [`server/src/common/services/oracle-listener.ts`](./server/src/common/services/oracle-listener.ts) — Chainlink oracle listener
- [`contracts/src/interfaces/AggregatorV3Interface.sol`](./contracts/src/interfaces/AggregatorV3Interface.sol) — Chainlink data feed interface
- [`contracts/src/interfaces/AutomationCompatibleInterface.sol`](./contracts/src/interfaces/AutomationCompatibleInterface.sol) — Chainlink Automation interface

## Smart Contract Deploy

- **Contract Address**: `0x65F971b490c9f5afcE465b9eEfCEFC91d25483c6` — [Arcscan](https://testnet.arcscan.app/address/0x65F971b490c9f5afcE465b9eEfCEFC91d25483c6)

## One-Line Pitch

**PolyPOP is a social-to-market stablecoin workflow: social disagreement starts on X, Uniswap powers entry routing plus bootstrap liquidity, Arc hosts the market and settlement, and Chainlink resolves and protects sensitive value flows.**

---

## The Problem

Predictions already happen in conversations.

People argue all the time on X about prices, headlines, outcomes, and narratives. But most of those disagreements never become real markets because the user flow is too fragmented:

- the market is not created where the conversation happens
- users may not hold the right asset
- users may not be on the right chain
- settlement is often too heavy or too public
- large payouts and treasury movements expose too much onchain information

---

## The Solution

PolyPOP connects four layers into one clean flow:

1. **X as the social trigger** — a tweet, reply, or argument becomes the trigger for a market.
2. **Arc as the market and settlement layer** — the prediction market is created natively on Arc and settled in USDC.
3. **Uniswap as the user entry layer** — if the user only has ETH on Base, Uniswap converts it into USDC automatically.
4. **Chainlink as the resolution and privacy layer** — Chainlink CRE resolves the market, and Chainlink privacy capabilities handle large private payout or treasury flows.

---

## Demo Flow

### Step 1 — A disagreement starts on X
Two users publicly argue about an outcome on X.

### Step 2 — A market is created on Arc
PolyPOP turns that disagreement into an Arc-native prediction market.

### Step 3 — A user wants to join, but only has ETH on Base
The user does not need to manually prepare USDC.

### Step 4 — Uniswap converts ETH into USDC
PolyPOP uses the **Uniswap Trading API** to convert the user's ETH on Base into USDC.

### Step 5 — USDC is bridged to Arc
PolyPOP uses **Arc Bridge Kit** to move USDC from Base to Arc.

### Step 6 — The user joins the market on Arc
The market runs and settles natively on Arc in USDC.

### Step 7 — Chainlink resolves the market
A **Chainlink CRE workflow** verifies the outcome and writes the result onchain.

### Step 8 — Large flows can go private
If a user wins a large amount, or if protocol revenue grows, the payout enters a **privacy-preserving settlement lane** instead of exposing the full value flow publicly.

---

## Why This Design Matters

PolyPOP is not just a prediction market UI.

It is a **stablecoin-native market workflow** that solves three real frictions at once:

- **social friction** — markets should begin where the disagreement already exists
- **asset friction** — users should not need to already hold USDC
- **settlement friction** — high-value payouts should not always be fully public

---

## Uniswap Integration

Uniswap is used in **two distinct ways** inside PolyPOP.

### A. Base-side asset conversion

If a user wants to join a market but only holds **ETH on Base**, PolyPOP uses Uniswap to convert it into **USDC on Base** before the user enters Arc. This makes Uniswap a real part of the entry flow rather than a cosmetic add-on.

PolyPOP uses Uniswap for:
- **quote generation** for ETH → USDC
- **approval / execution preparation**
- **swap transaction construction and execution**

Uniswap handles the swap on Base. Bridge Kit + CCTP handles the movement of USDC into Arc. Uniswap does **not** bridge funds into Arc.

### B. Cold-start counterparty logic

PolyPOP is designed for live disagreement, which means the first user may arrive before the other side exists. **Uniswap v4 hooks** are used to handle this case by customizing the position lifecycle and counterparty logic.

When a user opens a position before the betting window closes:

1. the protocol temporarily seeds the opposite side
2. real counterparties can still enter during the open window and take the other side
3. if a real counterparty arrives, the protocol-seeded position is reduced, replaced, or swapped out
4. if the window closes without a real counterparty, the protocol remains the final counterparty

This makes the market usable from the very first interaction.

