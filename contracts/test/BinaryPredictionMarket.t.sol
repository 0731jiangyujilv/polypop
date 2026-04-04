// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BinaryPredictionMarketFactory} from "../src/BinaryPredictionMarketFactory.sol";
import {BinaryPredictionMarket} from "../src/BinaryPredictionMarket.sol";
import {IBinaryPredictionMarket} from "../src/interfaces/IBinaryPredictionMarket.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract BinaryPredictionMarketTest is Test {
    BinaryPredictionMarketFactory public factory;
    BinaryPredictionMarket public market;
    MockERC20 public token;

    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public feeCollector = makeAddr("feeCollector");
    address public forwarder = makeAddr("forwarder");

    uint256 public constant MIN_AMOUNT = 10e6;
    uint256 public constant MAX_AMOUNT = 1000e6;
    uint256 public constant DURATION = 60;

    function setUp() public {
        vm.warp(10_000);

        token = new MockERC20("Mock USDC", "USDC", 6);

        vm.prank(owner);
        factory = new BinaryPredictionMarketFactory(owner);

        vm.startPrank(owner);
        factory.setSupportedToken(address(token), true);
        factory.setFee(250, feeCollector);
        factory.setForwarder(forwarder);
        vm.stopPrank();

        address[3] memory players = [alice, bob, charlie];
        for (uint256 i = 0; i < players.length; i++) {
            token.mint(players[i], 10_000e6);
            vm.prank(players[i]);
            token.approve(address(factory), type(uint256).max);
        }

        vm.prank(alice);
        (, address marketAddress) = factory.createMarket(
            address(token),
            MIN_AMOUNT,
            MAX_AMOUNT,
            DURATION,
            uint8(IBinaryPredictionMarket.Outcome.Yes),
            100e6
        );
        market = BinaryPredictionMarket(marketAddress);

        vm.prank(bob);
        token.approve(address(market), type(uint256).max);

        vm.prank(charlie);
        token.approve(address(market), type(uint256).max);
    }

    function test_factoryMinDurationIsOneMinute() public view {
        assertEq(factory.minDuration(), 60);
    }

    function test_createMarket() public view {
        IBinaryPredictionMarket.MarketInfo memory info = market.getMarketInfo();
        assertEq(info.creator, alice);
        assertEq(info.question, factory.DEFAULT_QUESTION());
        assertEq(info.duration, DURATION);
        assertEq(info.bettingDeadline, block.timestamp + 600);
        assertEq(uint256(info.status), uint256(IBinaryPredictionMarket.MarketStatus.Open));
        assertEq(info.totalYes, 100e6);
        assertEq(info.totalNo, 0);
    }

    function test_secondPlayerMustOpposeAndMatchAmount() public {
        vm.expectRevert(IBinaryPredictionMarket.SecondPredictionMustOpposeInitiator.selector);
        vm.prank(bob);
        market.placePrediction(IBinaryPredictionMarket.Outcome.Yes, 100e6);

        vm.expectRevert(IBinaryPredictionMarket.SecondPredictionAmountTooLow.selector);
        vm.prank(bob);
        market.placePrediction(IBinaryPredictionMarket.Outcome.No, 50e6);
    }

    function test_creLockAndResolveYes() public {
        vm.prank(bob);
        market.placePrediction(IBinaryPredictionMarket.Outcome.No, 100e6);

        vm.warp(market.bettingDeadline());
        vm.prank(forwarder);
        market.onReport("", abi.encode(uint8(0), uint8(0)));

        assertEq(uint256(market.status()), uint256(IBinaryPredictionMarket.MarketStatus.Locked));

        vm.warp(market.endTime());
        vm.prank(forwarder);
        market.onReport("", abi.encode(uint8(1), uint8(1)));

        assertEq(uint256(market.status()), uint256(IBinaryPredictionMarket.MarketStatus.Resolved));
        assertEq(uint256(market.resolvedOutcome()), uint256(IBinaryPredictionMarket.Outcome.Yes));
        assertFalse(market.isDraw());
    }

    function test_claimWinningSideAfterCreResolve() public {
        vm.prank(bob);
        market.placePrediction(IBinaryPredictionMarket.Outcome.No, 100e6);

        vm.warp(market.bettingDeadline());
        vm.prank(forwarder);
        market.onReport("", abi.encode(uint8(0), uint8(0)));

        vm.warp(market.endTime());
        vm.prank(forwarder);
        market.onReport("", abi.encode(uint8(1), uint8(1)));

        uint256 aliceBalanceBefore = token.balanceOf(alice);

        vm.prank(alice);
        market.claim();

        assertGt(token.balanceOf(alice), aliceBalanceBefore);
    }
}
