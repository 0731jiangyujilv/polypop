// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BetFactory} from "../src/BetFactory.sol";
import {PriceOracleFactory} from "../src/PriceOracleFactory.sol";

/// @title DeployFullStack
/// @notice Deploys PriceOracleFactory, seeds default oracles, and deploys a wired BetFactory.
contract DeployFullStack is Script {
    function run() external returns (BetFactory factory, PriceOracleFactory oracleFactory) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(250)); // default 2.5%

        vm.startBroadcast(deployerPrivateKey);

        factory = new BetFactory();
        console.log("BetFactory deployed at:", address(factory));

        oracleFactory = new PriceOracleFactory(deployer);
        console.log("PriceOracleFactory deployed at:", address(oracleFactory));

        oracleFactory.createOracle("BTC/USD", 8, "BetSys BTC/USD Oracle");
        oracleFactory.createOracle("LINK/USD", 8, "BetSys LINK/USD Oracle");
        oracleFactory.createOracle("VIRTUAL/USD", 8, "BetSys VIRTUAL/USD Oracle");
        oracleFactory.setOracleReporter("BTC/USD", deployer, true);
        oracleFactory.setOracleReporter("LINK/USD", deployer, true);
        oracleFactory.setOracleReporter("VIRTUAL/USD", deployer, true);

        address btcOracle = oracleFactory.getOracle("BTC/USD");
        address linkOracle = oracleFactory.getOracle("LINK/USD");
        address virtualOracle = oracleFactory.getOracle("VIRTUAL/USD");
        console.log("BTC oracle deployed at:", btcOracle);
        console.log("LINK oracle deployed at:", linkOracle);
        console.log("VIRTUAL oracle deployed at:", virtualOracle);

        if (usdcAddress != address(0)) {
            factory.setSupportedToken(usdcAddress, true);
            console.log("USDC supported:", usdcAddress);
        }

        if (feeBps > 0 && feeRecipient != address(0)) {
            factory.setFee(feeBps, feeRecipient);
            console.log("Fee set:", feeBps, "bps, recipient:", feeRecipient);
        }

        factory.setPriceFeed("BTC/USD", btcOracle);
        console.log("Price feed set: BTC/USD", btcOracle);

        factory.setPriceFeed("LINK/USD", linkOracle);
        console.log("Price feed set: LINK/USD", linkOracle);

        factory.setPriceFeed("VIRTUAL/USD", virtualOracle);
        console.log("Price feed set: VIRTUAL/USD", virtualOracle);

        vm.stopBroadcast();
    }
}
