# CRE Workflows

This repository now contains two CRE workflows:

- `por`
  Legacy proof-of-reserve workflow for stats verification
- `binary-weather`
  Hackathon workflow for the Arc binary market `Will crude oil price be higher in 6 hours?`

## Binary Weather Workflow

Path:

- [cre-workflow/binary-weather/main.ts](/Users/just/workspace/aibkh/chainlink/arc-uni-polypop/cre-workflow/binary-weather/main.ts)

Purpose:

- scan binary markets from the Arc market factory
- send `lock` reports after the 10 minute betting window closes
- fetch Cannes weather forecast
- send `resolve(0/1)` reports after the market duration elapses

Docs:

- [cre-workflow/binary-weather/README.md](/Users/just/workspace/aibkh/chainlink/arc-uni-polypop/cre-workflow/binary-weather/README.md)

## Important notes

- The new hackathon demo no longer depends on Chainlink Automation for settlement.
- The binary market contract is CRE-ready through `ReceiverTemplate`.
- You must set the correct Arc CRE forwarder in the factory before creating markets.
