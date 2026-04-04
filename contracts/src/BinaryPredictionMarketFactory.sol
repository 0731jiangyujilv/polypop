// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BinaryPredictionMarket} from "./BinaryPredictionMarket.sol";
import {IBinaryPredictionMarket} from "./interfaces/IBinaryPredictionMarket.sol";

contract BinaryPredictionMarketFactory is Ownable {
    using SafeERC20 for IERC20;

    string public constant DEFAULT_QUESTION = "Will it rain in Cannes tomorrow?";

    uint256 public nextMarketId;
    mapping(uint256 => address) public markets;
    mapping(address => bool) public supportedTokens;

    uint256 public minDuration = 60;
    uint256 public maxDuration = 1 days;
    uint256 public feeBps;
    address public feeRecipient;
    address public creForwarder;
    address public aceWorker;

    event MarketCreated(uint256 indexed marketId, address indexed market, address indexed creator, address token);
    event TokenUpdated(address indexed token, bool supported);
    event DurationLimitsUpdated(uint256 minDuration, uint256 maxDuration);
    event FeeUpdated(uint256 feeBps, address feeRecipient);
    event ForwarderUpdated(address indexed forwarder);
    event AceWorkerUpdated(address indexed aceWorker);

    error InvalidAmount();
    error InvalidDuration();
    error InvalidToken();
    error InvalidForwarder();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function createMarket(
        address token,
        uint256 minAmount,
        uint256 maxAmount,
        uint256 duration,
        uint8 initiatorOutcome,
        uint256 initiatorAmount
    ) external returns (uint256 marketId, address marketAddress) {
        if (minAmount == 0) revert InvalidAmount();
        if (maxAmount > 0 && maxAmount < minAmount) revert InvalidAmount();
        if (initiatorAmount < minAmount) revert InvalidAmount();
        if (maxAmount > 0 && initiatorAmount > maxAmount) revert InvalidAmount();
        if (initiatorOutcome > uint8(IBinaryPredictionMarket.Outcome.Yes)) revert InvalidAmount();
        if (duration < minDuration || duration > maxDuration) revert InvalidDuration();
        if (!supportedTokens[token]) revert InvalidToken();
        if (creForwarder == address(0)) revert InvalidForwarder();

        marketId = nextMarketId++;

        BinaryPredictionMarket market = new BinaryPredictionMarket(
            token,
            DEFAULT_QUESTION,
            minAmount,
            maxAmount,
            duration,
            msg.sender,
            feeBps,
            feeRecipient,
            creForwarder
        );
        market.transferOwnership(owner());

        marketAddress = address(market);
        markets[marketId] = marketAddress;

        if (aceWorker != address(0)) {
            market.setAceWorker(aceWorker);
        }

        IERC20(token).safeTransferFrom(msg.sender, marketAddress, initiatorAmount);
        market.initializeCreatorPrediction(
            msg.sender,
            IBinaryPredictionMarket.Outcome(initiatorOutcome),
            initiatorAmount
        );

        emit MarketCreated(marketId, marketAddress, msg.sender, token);
    }

    function getMarket(uint256 marketId) external view returns (address) {
        return markets[marketId];
    }

    function getMarketCount() external view returns (uint256) {
        return nextMarketId;
    }

    function setSupportedToken(address token, bool supported) external onlyOwner {
        supportedTokens[token] = supported;
        emit TokenUpdated(token, supported);
    }

    function setDurationLimits(uint256 _minDuration, uint256 _maxDuration) external onlyOwner {
        require(_minDuration >= 60 && _minDuration < _maxDuration, "Invalid duration limits");
        minDuration = _minDuration;
        maxDuration = _maxDuration;
        emit DurationLimitsUpdated(_minDuration, _maxDuration);
    }

    function setFee(uint256 _feeBps, address _feeRecipient) external onlyOwner {
        require(_feeBps <= 1000, "Fee too high");
        require(_feeBps == 0 || _feeRecipient != address(0), "Invalid fee recipient");
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
        emit FeeUpdated(_feeBps, _feeRecipient);
    }

    function setForwarder(address _forwarder) external onlyOwner {
        if (_forwarder == address(0)) revert InvalidForwarder();
        creForwarder = _forwarder;
        emit ForwarderUpdated(_forwarder);
    }

    function setAceWorker(address _aceWorker) external onlyOwner {
        aceWorker = _aceWorker;
        emit AceWorkerUpdated(_aceWorker);
    }

    function configureAceWorkerOnMarket(uint256 marketId) external onlyOwner {
        require(aceWorker != address(0), "aceWorker not set");
        BinaryPredictionMarket(markets[marketId]).setAceWorker(aceWorker);
    }
}
