# Arc Binary Weather CRE Workflow

This workflow locks and resolves the Arc binary prediction market:

`Will crude oil price be higher in 6 hours?`

It performs two actions:

- `lock`
  After the 10 minute betting window closes, CRE sends a signed report with `action = 0`
- `resolve`
  After `startTime + duration`, CRE fetches the weather forecast for Cannes and sends `action = 1` with `outcome = 0 | 1`

The workflow scans markets from the binary market factory, so it can process more than one active Arc weather market in the same run.

## Outcome rule

- `0 = No`
- `1 = Yes`

The workflow currently uses `Open-Meteo` and maps:

- `daily.rain_sum[1] > rainThresholdMm` -> `1`
- otherwise -> `0`

## Config

Edit [config.staging.json](/Users/just/workspace/aibkh/chainlink/arc-uni-polypop/cre-workflow/binary-weather/config.staging.json):

- `schedule`
- `weatherApiUrl`
- `rainThresholdMm`
- `evms[0].marketFactoryAddress`
- `evms[0].chainSelectorName`
- `evms[0].gasLimit`

## Simulate

```bash
cd /Users/just/workspace/aibkh/chainlink/arc-uni-polypop/cre-workflow/binary-weather
npm install
cre workflow simulate binary-weather --target staging-settings
```

## Broadcast

```bash
cre workflow simulate binary-weather --target staging-settings --broadcast
```

## Deploy

```bash
cre workflow deploy binary-weather --target staging-settings
```

## Contract expectation

The receiver contract must support CRE `writeReport()` and decode:

```solidity
(uint8 action, uint8 outcome)
```

This repository wires that into:

- [BinaryPredictionMarket.sol](/Users/just/workspace/aibkh/chainlink/arc-uni-polypop/contracts/src/BinaryPredictionMarket.sol)

with:

- `ACTION_LOCK = 0`
- `ACTION_RESOLVE = 1`
