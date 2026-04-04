// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";
import {IBinaryPredictionMarket} from "./interfaces/IBinaryPredictionMarket.sol";

contract BinaryPredictionMarket is IBinaryPredictionMarket, ReceiverTemplate, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant ACTION_LOCK = 0;
    uint8 public constant ACTION_RESOLVE = 1;
    uint256 public constant BETTING_WINDOW = 600;

    address public immutable creator;
    IERC20 public immutable token;
    string public question;
    uint256 public immutable minAmount;
    uint256 public immutable maxAmount;
    uint256 public immutable duration;
    uint256 public immutable bettingDeadline;
    address public immutable factory;
    uint256 public immutable feeBps;
    address public immutable feeRecipient;

    uint256 public startTime;
    uint256 public endTime;
    MarketStatus public status;
    Outcome public resolvedOutcome;
    bool public isDraw;
    uint256 public totalYes;
    uint256 public totalNo;
    uint256 public prizePool;
    uint256 public totalPlayers;
    Outcome public initiatorOutcome;
    uint256 public initiatorAmount;

    Position[] internal _yesPositions;
    Position[] internal _noPositions;

    mapping(address => bool) public hasPlaced;
    mapping(address => Outcome) public playerOutcome;
    mapping(address => uint256) public playerAmount;
    mapping(address => bool) public claimed;
    mapping(address => bool) public privacyMode;

    address public aceWorker;

    constructor(
        address _token,
        string memory _question,
        uint256 _minAmount,
        uint256 _maxAmount,
        uint256 _duration,
        address _creator,
        uint256 _feeBps,
        address _feeRecipient,
        address _forwarder
    ) ReceiverTemplate(_forwarder) {
        if (_feeBps > 1000) revert InvalidFee();
        creator = _creator;
        token = IERC20(_token);
        question = _question;
        minAmount = _minAmount;
        maxAmount = _maxAmount;
        duration = _duration;
        bettingDeadline = block.timestamp + BETTING_WINDOW;
        factory = msg.sender;
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
        status = MarketStatus.Open;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    modifier inStatus(MarketStatus expected) {
        if (status != expected) revert InvalidStatus();
        _;
    }

    modifier onlyAceWorker() {
        if (msg.sender != aceWorker) revert NotAceWorker();
        _;
    }

    function placePrediction(Outcome outcome, uint256 amount) external nonReentrant inStatus(MarketStatus.Open) {
        if (block.timestamp >= bettingDeadline) revert BettingClosed();
        if (hasPlaced[msg.sender]) revert AlreadyPlaced();

        _validatePrediction(outcome, amount);
        _recordPrediction(msg.sender, outcome, amount);
        token.safeTransferFrom(msg.sender, address(this), amount);

        emit PredictionPlaced(msg.sender, outcome, amount);
    }

    function initializeCreatorPrediction(address player, Outcome outcome, uint256 amount)
        external
        onlyFactory
        inStatus(MarketStatus.Open)
    {
        if (totalPlayers != 0) revert InvalidInitialPrediction();
        if (player != creator) revert InvalidInitialPrediction();

        _validatePrediction(outcome, amount);
        _recordPrediction(player, outcome, amount);

        initiatorOutcome = outcome;
        initiatorAmount = amount;

        emit PredictionPlaced(player, outcome, amount);
    }

    function lock() external onlyOwner inStatus(MarketStatus.Open) {
        if (block.timestamp < bettingDeadline) revert BettingStillOpen();
        _lock();
    }

    function resolve(uint8 outcome) external onlyOwner inStatus(MarketStatus.Locked) {
        if (block.timestamp < endTime) revert MarketNotExpired();
        _resolve(outcome);
    }

    function cancel() external onlyOwner inStatus(MarketStatus.Open) {
        if (block.timestamp < bettingDeadline) revert BettingStillOpen();
        status = MarketStatus.Cancelled;
        emit MarketCancelled();
    }

    function setAceWorker(address worker) external onlyFactory {
        aceWorker = worker;
        emit AceWorkerSet(worker);
    }

    function setPrivacyMode(address player, bool enabled) external onlyAceWorker {
        privacyMode[player] = enabled;
        emit PrivacyModeSet(player, enabled);
    }

    function claimByWorker(address player) external nonReentrant onlyAceWorker {
        uint256 payout = _computePayout(player);
        claimed[player] = true;
        token.safeTransfer(aceWorker, payout);
        emit ClaimedByWorker(player, aceWorker, payout);
    }

    function claim() external nonReentrant {
        if (privacyMode[msg.sender]) revert PrivacyModeEnabled();
        _claimFor(msg.sender);
    }

    function claimFor(address player) external nonReentrant {
        if (privacyMode[player]) revert PrivacyModeEnabled();
        _claimFor(player);
    }

    function getMarketInfo() external view returns (MarketInfo memory info) {
        info.creator = creator;
        info.token = address(token);
        info.question = question;
        info.minAmount = minAmount;
        info.maxAmount = maxAmount;
        info.duration = duration;
        info.bettingDeadline = bettingDeadline;
        info.startTime = startTime;
        info.endTime = endTime;
        info.status = status;
        info.resolvedOutcome = resolvedOutcome;
        info.isDraw = isDraw;
        info.totalYes = totalYes;
        info.totalNo = totalNo;
        info.prizePool = prizePool;
        info.feeBps = feeBps;
        info.feeRecipient = feeRecipient;
    }

    function getYesPositions() external view returns (Position[] memory) {
        return _yesPositions;
    }

    function getNoPositions() external view returns (Position[] memory) {
        return _noPositions;
    }

    function claimable(address player) external view returns (uint256) {
        if (!hasPlaced[player] || claimed[player]) return 0;

        if (status == MarketStatus.Cancelled) {
            return playerAmount[player];
        }

        if (status != MarketStatus.Resolved) return 0;
        if (isDraw) return playerAmount[player];
        if (playerOutcome[player] != resolvedOutcome) return 0;

        uint256 winningTotal = resolvedOutcome == Outcome.Yes ? totalYes : totalNo;
        return (prizePool * playerAmount[player]) / winningTotal;
    }

    function hasClaimed(address player) external view returns (bool) {
        return claimed[player];
    }

    function _processReport(bytes calldata report) internal override {
        (uint8 action, uint8 outcome) = abi.decode(report, (uint8, uint8));

        if (action == ACTION_LOCK) {
            if (status != MarketStatus.Open) revert InvalidStatus();
            if (block.timestamp < bettingDeadline) revert BettingStillOpen();
            _lock();
            return;
        }

        if (action == ACTION_RESOLVE) {
            if (status != MarketStatus.Locked) revert InvalidStatus();
            if (block.timestamp < endTime) revert MarketNotExpired();
            _resolve(outcome);
            return;
        }

        revert InvalidAction();
    }

    function _lock() internal {
        startTime = block.timestamp;
        endTime = startTime + duration;
        status = MarketStatus.Locked;
        emit MarketLocked(startTime, endTime);
    }

    function _resolve(uint8 outcome) internal {
        if (outcome > uint8(Outcome.Yes)) revert InvalidOutcome();

        status = MarketStatus.Resolved;
        resolvedOutcome = Outcome(outcome);

        bool isContested = totalYes > 0 && totalNo > 0;
        if (!isContested) {
            isDraw = true;
        }

        uint256 totalPool = totalYes + totalNo;
        if (!isDraw && feeBps > 0 && feeRecipient != address(0)) {
            uint256 totalFee = (totalPool * feeBps) / 10_000;
            uint256 creatorFee = (totalFee * 30) / 100;
            uint256 platformFee = totalFee - creatorFee;

            if (creatorFee > 0) token.safeTransfer(creator, creatorFee);
            if (platformFee > 0) token.safeTransfer(feeRecipient, platformFee);

            prizePool = totalPool - totalFee;
        } else {
            prizePool = totalPool;
        }

        emit MarketResolved(resolvedOutcome, isDraw);
    }

    function _validatePrediction(Outcome outcome, uint256 amount) internal view {
        if (uint8(outcome) > uint8(Outcome.Yes)) revert InvalidOutcome();
        if (amount < minAmount) revert AmountTooLow();
        if (maxAmount > 0 && amount > maxAmount) revert AmountTooHigh();

        if (totalPlayers == 1) {
            if (outcome == initiatorOutcome) revert SecondPredictionMustOpposeInitiator();
            if (amount < initiatorAmount) revert SecondPredictionAmountTooLow();
        }
    }

    function _recordPrediction(address player, Outcome outcome, uint256 amount) internal {
        hasPlaced[player] = true;
        playerOutcome[player] = outcome;
        playerAmount[player] = amount;
        totalPlayers += 1;

        if (outcome == Outcome.Yes) {
            _yesPositions.push(Position(player, amount));
            totalYes += amount;
        } else {
            _noPositions.push(Position(player, amount));
            totalNo += amount;
        }
    }

    function _computePayout(address player) internal view returns (uint256 payout) {
        if (!hasPlaced[player]) revert NotAPlayer();
        if (claimed[player]) revert AlreadyClaimed();

        if (status == MarketStatus.Cancelled || isDraw) {
            return playerAmount[player];
        }
        if (status != MarketStatus.Resolved) revert MarketNotReady();
        if (playerOutcome[player] != resolvedOutcome) revert NothingToClaim();

        uint256 winningTotal = resolvedOutcome == Outcome.Yes ? totalYes : totalNo;
        payout = (prizePool * playerAmount[player]) / winningTotal;
        if (payout == 0) revert NothingToClaim();
    }

    function _claimFor(address player) internal {
        if (!hasPlaced[player]) revert NotAPlayer();
        if (claimed[player]) revert AlreadyClaimed();

        uint256 payout;

        if (status == MarketStatus.Cancelled || isDraw) {
            payout = playerAmount[player];
        } else {
            if (status != MarketStatus.Resolved) revert MarketNotReady();
            if (playerOutcome[player] != resolvedOutcome) revert NothingToClaim();

            uint256 winningTotal = resolvedOutcome == Outcome.Yes ? totalYes : totalNo;
            payout = (prizePool * playerAmount[player]) / winningTotal;
        }

        if (payout == 0) revert NothingToClaim();

        claimed[player] = true;
        token.safeTransfer(player, payout);

        emit Claimed(player, payout);
    }
}
