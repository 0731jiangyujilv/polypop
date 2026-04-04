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
