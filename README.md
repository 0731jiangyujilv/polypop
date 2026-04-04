# polypop

PolyPOP is a USDC-native prediction market system with two focused demos: a real-world signal market settled in USDC using Chainlink CRE, and a cross-chain short-duration market where Arc serves as the USDC liquidity hub, Base is only the execution venue, and Uniswap powers entry routing plus bootstrap liquidity.

Arc：liquidity hub / advanced stablecoin logic / crosschain settlement 

Uniswap：API routing + bootstrap liquidity demo on Base 

Chainlink：onchain state-changing settlement flow 

Privacy(Chainlink Privacy Standard): 
1. Winners can opt into private settlement;
2. Protocol fees can be swept into a private treasury lane

## One-Line Pitch

**PolyPOP is a social-to-market stablecoin workflow: social disagreement starts on X, Uniswap converts user assets into USDC, Arc hosts the market and settlement, and Chainlink resolves and protects sensitive value flows.**

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

## Sponsor Mapping

### Arc
Arc is the native market and settlement layer.

PolyPOP uses Arc for:
- market creation
- USDC collateral
- onchain settlement
- programmable stablecoin logic

### Uniswap
Uniswap is the asset entry and execution layer.

PolyPOP uses Uniswap for:
- ETH → USDC conversion
- clean user entry into a stablecoin-settled market
- execution and routing at the point of market entry

### Chainlink
Chainlink is the resolution and privacy layer.

PolyPOP uses Chainlink for:
- market resolution through CRE
- workflow orchestration
- privacy-preserving payout and treasury flows

---

## Key Features

- social-native market creation from X
- Arc-native USDC market settlement
- Base ETH user entry without pre-holding USDC
- automatic ETH → USDC conversion through Uniswap
- Base → Arc USDC bridge flow
- Chainlink-powered resolution
- optional privacy lane for large winner payouts
- optional privacy lane for protocol treasury flows

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
