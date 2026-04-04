# Bet Settlement Logic

This document describes the current logic in:

- `contracts/src/Bet.sol`
- `contracts/src/BetFactory.sol`
- `contracts/src/PriceOracle.sol`
- `bot/src/common/services/settlement.ts`

## Overview

Each market is an independent `Bet` contract created by `BetFactory`.

Current state machine:

- `Open`
- `Locked`
- `Settled`

There is no cancel path.

Once a bet is created and the initiator's first position is recorded, the bet can only progress forward to `Locked` and then `Settled`.

## Roles

There are now three core roles in the lifecycle:

- `creator`: the user who created the bet and placed the first position
- `admin`: the address injected by `BetFactory` when the bet is deployed
- `reporter`: an address allowed to push prices into `PriceOracle`

Current authority model:

- `BetFactory.owner()` becomes the `admin` of every newly created `Bet`
- `lock()` can only be called by `admin`
- `settle()` can only be called by `admin`
- `PriceOracle.owner()` can always report prices
- `PriceOracle.owner()` may optionally approve extra `reporter` addresses

In the current bot design, the admin wallet is expected to run the timed job and perform both:

1. `reportPrice(...)`
2. `lock()` or `settle()`

## Creation Flow

`BetFactory.createBet(...)` does the following:

1. Validates token, asset, duration, amount limits, initiator side, and initiator amount.
2. Resolves the asset to an oracle address from `priceFeeds[asset]`.
3. Deploys a new `Bet`.
4. Passes `BetFactory.owner()` into the `Bet` constructor as `admin`.
5. Transfers the initiator's first stake into the new `Bet`.
6. Calls `initializeCreatorBet(...)` to record the first position.

Important consequences:

- every new bet starts with one existing position
- every new bet starts in `Open`
- the price source is whatever oracle address the factory mapped for that asset at creation time

## Oracle Model

`PriceOracle` is a pull-style project oracle.

It keeps Chainlink-style round data so `Bet` can continue reading prices through:

- `latestRoundData()`
- `getRoundData(roundId)`

But unlike a push feed, prices are only updated when an approved reporter calls:

- `reportPrice(int256 answer)`

Each report creates a new round with:

- incremented `roundId`
- `answer`
- `timestamp = block.timestamp`

This means the system now controls exactly when fresh settlement prices are written on-chain.

## Betting Flow

During `Open`:

- users can call `placeBet(side, amount)`
- each address can only place one position
- amount must satisfy `minAmount <= amount <= maxAmount`, unless `maxAmount == 0`

Special rule for the second player:

- the second player must choose the opposite side of the initiator
- the second player's amount must be at least the initiator's amount

After the second player, later users can join either side normally.

## Lock Flow

The bet can be locked when:

- status is `Open`
- `block.timestamp >= bettingDeadline`
- caller is `admin`

Recommended execution sequence:

1. Bot fetches the latest off-chain market price.
2. Bot calls `PriceOracle.reportPrice(...)`.
3. Bot calls `Bet.lock()`.

`lock()` then:

1. Reads `latestRoundData()` from the configured oracle.
2. Rejects stale data.
3. Stores:
   - `startPrice`
   - `startTime`
   - `endTime = startTime + duration`
4. Moves the bet to `Locked`.

Single-sided bets are still allowed to lock.

## Settlement Flow

The bet can be settled when:

- status is `Locked`
- `block.timestamp >= endTime`
- caller is `admin`

Recommended execution sequence:

1. Bot fetches the latest off-chain market price.
2. Bot calls `PriceOracle.reportPrice(...)`.
3. Bot calls `Bet.settle()`.

`settle()` then:

1. Reads `latestRoundData()` from the configured oracle.
2. Rejects stale data.
3. Stores `endPrice`.
4. Moves the bet to `Settled`.
5. Determines whether the result is:
   - `Up` wins
   - `Down` wins
   - refund-only settlement

## Result Branches

### Branch A: Contested bet, price up

Conditions:

- `totalUp > 0`
- `totalDown > 0`
- `endPrice > startPrice`

Effects:

- `winningSide = Up`
- `isDraw = false`
- fee is charged
- winners claim proportionally from `prizePool`

### Branch B: Contested bet, price down

Conditions:

- `totalUp > 0`
- `totalDown > 0`
- `endPrice < startPrice`

Effects:

- `winningSide = Down`
- `isDraw = false`
- fee is charged
- winners claim proportionally from `prizePool`

### Branch C: Refund-only settlement

Conditions:

- `endPrice == startPrice`, or
- only one side has funds

Effects:

- `isDraw = true`
- no fee is charged
- `prizePool = totalPool`
- every bettor can claim back exactly `playerAmount`

Note:

The contract uses `isDraw = true` both for a true price draw and for a single-sided refund-only market.

## Fee Logic

Fees are charged only when there is a real winning side.

Fee calculation:

- `totalFee = totalPool * feeBps / 10_000`
- `creatorFee = totalFee * 30 / 100`
- `platformFee = totalFee - creatorFee`
- `prizePool = totalPool - totalFee`

Distribution:

- `creatorFee` goes to `creator`
- `platformFee` goes to `feeRecipient`

No fee is charged when:

- price is unchanged
- only one side has funds

## Claim Logic

Settlement does not auto-transfer payouts.

After `Settled`, users must call `claim()`.

Claim rules:

- caller must have placed a bet
- caller must not have claimed already

If `isDraw == true`:

- payout is the caller's original stake

If `isDraw == false`:

- only players on `winningSide` can claim
- payout is:
  - `prizePool * playerAmount[player] / winningSideTotal`

Losers cannot claim.

## Emergency Withdraw

Emergency withdraw remains the fallback for oracle failure after lock.

Requirements:

- status must still be `Locked`
- caller must be a bettor
- `block.timestamp >= endTime + EMERGENCY_TIMELOCK`
- caller must not have already claimed

Effect:

- caller withdraws exactly their original stake

This is the escape hatch if admin reporting fails for too long after lock.

## Bot Execution Flow

The bot no longer registers or uses Chainlink Automation.

Instead, `bot/src/services/settlement.ts` runs a timed executor:

1. Poll active bets in DB with status `OPEN` or `LOCKED`
2. Read on-chain `getBetInfo()`
3. If an `OPEN` bet is past `bettingDeadline`:
   - fetch latest market price
   - report price to the oracle
   - call `lock()`
4. If a `LOCKED` bet is past `endTime`:
   - fetch latest market price
   - report price to the oracle
   - call `settle()`
5. Sync DB fields from the refreshed on-chain state

The current bot implementation uses Coinbase spot ticker endpoints for off-chain market data before reporting on-chain.

## Practical Implications

1. The system now controls the exact timing of the on-chain price update used for lock and settlement.
2. Lock and settlement no longer depend on Chainlink Automation.
3. Fairness is improved for timestamp-sensitive markets because the bot can report just before lock and just before settlement.
4. The execution path is now more centralized:
   `BetFactory.owner()` and the bot's admin wallet become critical infrastructure.
5. Manual `claim()` is still the payout path, which keeps settlement lightweight and avoids looping through winners during `settle()`.
