# PolyPOP

PolyPOP turns live disagreement into live markets.
When users are already arguing on X, debating with friends, or seeing two clear sides to a question, they can tag @_PolyPOP to deploy an onchain prediction market directly from the conversation.

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
- `contracts/src/BinaryPredictionMarket.sol` — core prediction market contract
- `contracts/src/BinaryPredictionMarketFactory.sol` — market factory contract
- `contracts/src/interfaces/IBinaryPredictionMarket.sol` — market interface
- `contracts/src/interfaces/ReceiverTemplate.sol` — cross-chain receiver template
- `contracts/src/interfaces/IReceiver.sol` — cross-chain receiver interface
- `server/src/common/services/settlement.ts` — settlement logic
- `server/src/common/services/claim.ts` — claim logic
- `server/src/common/services/bet-listener.ts` — bet event listener
- `server/src/common/services/market-data.ts` — market data service
- `webapp/src/lib/bridge.ts` — cross-chain bridge calls
- `webapp/src/pages/CreatePredictionPage.tsx` / `HackathonCreatePage.tsx` — market creation pages
- `webapp/src/pages/MarketPage.tsx` / `HackathonMarketPage.tsx` — market pages
- `webapp/src/pages/BetPage.tsx` — betting page

### Uniswap (Swap / Trade Routing)
- `webapp/src/lib/uniswap.ts` — Uniswap integration utilities
- `webapp/src/lib/uniswapApi.ts` — Uniswap API routing wrapper
- `webapp/src/pages/SwapPage.tsx` — swap page

### Chainlink (CRE Workflow / ACE Engine / Compliant Private Transfer)
- `cre-workflow/binary-weather/main.ts` — CRE workflow main logic
- `cre-workflow/binary-weather/workflow.yaml` — CRE workflow config
- `cre-workflow/project.yaml` — CRE project config
- `server/src/ace-worker.ts` — ACE Engine worker
- `server/src/common/aceApi.ts` — ACE API (server-side)
- `webapp/src/lib/aceApi.ts` — ACE API (client-side)
- `webapp/src/pages/AceClaimPage.tsx` — ACE compliant transfer claim page
- `server/src/common/services/oracle-listener.ts` — Chainlink oracle listener
- `contracts/src/interfaces/AggregatorV3Interface.sol` — Chainlink data feed interface
- `contracts/src/interfaces/AutomationCompatibleInterface.sol` — Chainlink Automation interface


## One-Line Pitch

**PolyPOP is a social-to-market stablecoin workflow: social disagreement starts on X, Uniswap powers entry routing plus bootstrap liquidity, Arc hosts the market and settlement, and Chainlink resolves and protects sensitive value flows.**



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

1. **X as the social trigger**  
   A tweet, reply, or argument becomes the trigger for a market.

2. **Arc as the market and settlement layer**  
   The prediction market is created natively on Arc and settled in USDC.

3. **Uniswap as the user entry layer**  
   If the user only has ETH on Base, Uniswap converts ETH into USDC automatically.

4. **Chainlink as the resolution and privacy layer**  
   Chainlink CRE resolves the market, and Chainlink privacy capabilities handle large private payout or treasury flows.

---

## Demo Flow

### Step 1 — A disagreement starts on X
Two users publicly argue about an outcome on X.

### Step 2 — A market is created on Arc
PolyPOP turns that disagreement into an Arc-native prediction market.

### Step 3 — A user wants to join, but only has ETH on Base
The user does not need to manually prepare USDC.

### Step 4 — Uniswap converts ETH into USDC
PolyPOP uses the **Uniswap Trading API** to convert the user’s ETH on Base into USDC.

### Step 5 — USDC is bridged to Arc
PolyPOP uses **Arc Bridge Kit** to move USDC from Base to Arc.

### Step 6 — The user joins the market on Arc
The market runs and settles natively on Arc in USDC.

### Step 7 — Chainlink resolves the market
A **Chainlink CRE workflow** verifies the outcome and writes the result onchain.

### Step 8 — Large flows can go private
If a user wins a large amount, or if protocol revenue becomes large, the payout can enter a **privacy-preserving settlement lane** instead of exposing the full value flow publicly.

---

## Why This Design Matters

PolyPOP is not just a prediction market UI.

It is a **stablecoin-native market workflow** that solves three real frictions at once:

- **social friction** — markets should begin where the disagreement already exists
- **asset friction** — users should not need to already hold USDC
- **settlement friction** — high-value payouts should not always be fully public

---


## Architecture

### Social Layer
- X / Twitter conversation
- tweet, reply, mention, or bot trigger
- market request generation

### Market Layer
- Arc-native market factory
- USDC-denominated prediction market
- collateral locking
- claim / settlement state

### Entry Layer
- Base wallet connection
- ETH balance detection
- Uniswap Trading API for ETH → USDC conversion

### Crosschain Transfer Layer
- Arc Bridge Kit
- USDC transfer from Base to Arc

### Resolution Layer
- Chainlink CRE workflow
- outcome verification
- resolution state update

### Privacy Layer
- private payout lane for large winners
- private treasury lane for large protocol revenue
- privacy-preserving workflow for sensitive value flows

---



## Technical Stack

### Frontend
- Next.js
- React
- TypeScript
- wallet connection UI

### Smart Contracts
- Solidity
- Arc market factory
- market settlement logic
- claim / payout logic

### Routing and Execution
- Uniswap Trading API
- swap quote + transaction building

### Bridging
- Arc Bridge Kit
- CCTP-based USDC transfer flow

### Oracle / Workflow / Privacy
- Chainlink CRE
- Chainlink Confidential Compute / Confidential HTTP

---

## Uniswap Integration

Uniswap is used in **two distinct ways** inside PolyPOP.

### A. Base-side asset conversion
If a user wants to join a market but only holds **ETH on Base**, PolyPOP uses Uniswap to convert that asset into **USDC on Base** before the user enters Arc.

This makes Uniswap a real part of the user entry flow rather than a cosmetic add-on.

### Uniswap API surfaces used
PolyPOP uses Uniswap for:
- **quote generation** for ETH → USDC
- **approval / execution preparation**
- **swap transaction construction and execution**

In PolyPOP:
- **Uniswap handles the swap on Base**
- **Bridge Kit + CCTP handles the movement of USDC into Arc**

Uniswap does **not** bridge funds into Arc.

### B. Extreme cold-start market logic
PolyPOP also uses **Uniswap v4 hooks** for an extreme counterparty case during the betting window.

If a user opens a position before the betting window closes, the protocol can temporarily seed the opposite side and become the provisional counterparty.

During that open betting window:
- other users can still enter
- they can take the other side against the protocol-seeded position
- the protocol only acts as temporary backstop liquidity

If no real counterparty enters before the betting window closes:
- the protocol remains the final counterparty to the initiating user

This is where **Uniswap v4 hooks** is used to customize the lifecycle of the position and counterparty logic.

---

## Cold-Start Market Logic

PolyPOP is designed for live disagreement, which means the first user may arrive before the other side exists.

To solve that, PolyPOP supports a protocol-assisted start:

1. User A opens the initial side of the market
2. the protocol temporarily seeds the opposite side
3. during the betting window, real counterparties can still enter
4. if a real counterparty arrives, the protocol-seeded position can be reduced, replaced, or swapped out
5. if the window closes without a real counterparty, the protocol becomes the final counterparty

This makes the market usable from the very first interaction.


## Key Features

- turn live disagreement into onchain markets
- tag-based market creation through **@_PolyPOP**
- Arc-native USDC settlement
- Base ETH user entry without pre-holding USDC
- Uniswap-powered ETH → USDC swap on Base
- Base → Arc transfer through Bridge Kit + CCTP
- cold-start market support
- Uniswap v4 hook-based counterparty logic
- Chainlink-powered resolution
- optional privacy-preserving payout lane
- optional private treasury lane


