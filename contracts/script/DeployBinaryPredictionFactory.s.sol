// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BinaryPredictionMarketFactory} from "../src/BinaryPredictionMarketFactory.sol";

contract DeployBinaryPredictionFactory is Script {
    function run() external returns (BinaryPredictionMarketFactory factory) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address forwarderAddress = vm.envAddress("FORWARDER_ADDRESS");
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(250));

        vm.startBroadcast(deployerPrivateKey);

        factory = new BinaryPredictionMarketFactory(deployer);
        console.log("BinaryPredictionMarketFactory deployed at:", address(factory));

        factory.setSupportedToken(usdcAddress, true);
        factory.setFee(feeBps, feeRecipient);
        factory.setForwarder(forwarderAddress);

        console.log("USDC supported:", usdcAddress);
        console.log("Fee recipient:", feeRecipient);
        console.log("CRE forwarder:", forwarderAddress);

        vm.stopBroadcast();
    }
}
