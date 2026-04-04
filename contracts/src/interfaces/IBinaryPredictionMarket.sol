// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBinaryPredictionMarket {
    enum MarketStatus {
        Open,
        Locked,
        Resolved,
        Cancelled
    }

    enum Outcome {
        No,
        Yes
    }

    struct Position {
        address player;
        uint256 amount;
    }

    struct MarketInfo {
        address creator;
        address token;
        string question;
        uint256 minAmount;
        uint256 maxAmount;
        uint256 duration;
        uint256 bettingDeadline;
        uint256 startTime;
        uint256 endTime;
        MarketStatus status;
        Outcome resolvedOutcome;
        bool isDraw;
        uint256 totalYes;
        uint256 totalNo;
        uint256 prizePool;
        uint256 feeBps;
        address feeRecipient;
    }

    event PredictionPlaced(address indexed player, Outcome indexed outcome, uint256 amount);
    event MarketLocked(uint256 startTime, uint256 endTime);
    event MarketResolved(Outcome indexed outcome, bool isDraw);
    event Claimed(address indexed player, uint256 payout);
    event MarketCancelled();
    event AceWorkerSet(address indexed aceWorker);
    event PrivacyModeSet(address indexed player, bool enabled);
    event ClaimedByWorker(address indexed player, address indexed worker, uint256 payout);

    error InvalidStatus();
    error BettingClosed();
    error AlreadyPlaced();
    error AmountTooLow();
    error AmountTooHigh();
    error MarketNotReady();
    error MarketNotExpired();
    error NothingToClaim();
    error AlreadyClaimed();
    error NotAPlayer();
    error InvalidOutcome();
    error InvalidFee();
    error BettingStillOpen();
    error OnlyFactory();
    error SecondPredictionMustOpposeInitiator();
    error SecondPredictionAmountTooLow();
    error InvalidInitialPrediction();
    error InvalidAction();
    error NotAceWorker();
    error PrivacyModeEnabled();

    function placePrediction(Outcome outcome, uint256 amount) external;
    function initializeCreatorPrediction(address player, Outcome outcome, uint256 amount) external;
    function lock() external;
    function resolve(uint8 outcome) external;
    function cancel() external;
    function claim() external;
    function claimFor(address player) external;
    function getMarketInfo() external view returns (MarketInfo memory info);
    function getYesPositions() external view returns (Position[] memory);
    function getNoPositions() external view returns (Position[] memory);
    function claimable(address player) external view returns (uint256);
    function hasClaimed(address player) external view returns (bool);
    function setAceWorker(address worker) external;
    function setPrivacyMode(address player, bool enabled) external;
    function claimByWorker(address player) external;
    function privacyMode(address player) external view returns (bool);
    function aceWorker() external view returns (address);
}
