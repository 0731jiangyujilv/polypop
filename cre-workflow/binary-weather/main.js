"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
var cre_sdk_1 = require("@chainlink/cre-sdk");
var viem_1 = require("viem");
var FACTORY_ABI = [
    {
        inputs: [],
        name: 'getMarketCount',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'marketId', type: 'uint256' }],
        name: 'getMarket',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
];
var MARKET_ABI = [
    {
        inputs: [],
        name: 'getMarketInfo',
        outputs: [
            {
                name: 'info',
                type: 'tuple',
                components: [
                    { name: 'creator', type: 'address' },
                    { name: 'token', type: 'address' },
                    { name: 'question', type: 'string' },
                    { name: 'minAmount', type: 'uint256' },
                    { name: 'maxAmount', type: 'uint256' },
                    { name: 'duration', type: 'uint256' },
                    { name: 'bettingDeadline', type: 'uint256' },
                    { name: 'startTime', type: 'uint256' },
                    { name: 'endTime', type: 'uint256' },
                    { name: 'status', type: 'uint8' },
                    { name: 'resolvedOutcome', type: 'uint8' },
                    { name: 'isDraw', type: 'bool' },
                    { name: 'totalYes', type: 'uint256' },
                    { name: 'totalNo', type: 'uint256' },
                    { name: 'prizePool', type: 'uint256' },
                    { name: 'feeBps', type: 'uint256' },
                    { name: 'feeRecipient', type: 'address' },
                ],
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
];
var MARKET_STATUS_OPEN = 0;
var MARKET_STATUS_LOCKED = 1;
var ACTION_LOCK = 0;
var ACTION_RESOLVE = 1;
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var runner;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, cre_sdk_1.Runner.newRunner()];
                case 1:
                    runner = _a.sent();
                    return [4 /*yield*/, runner.run(initWorkflow)];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
var initWorkflow = function (config) {
    var cronTrigger = new cre_sdk_1.CronCapability();
    return [
        (0, cre_sdk_1.handler)(cronTrigger.trigger({
            schedule: config.schedule,
        }), onCronTrigger),
    ];
};
var onCronTrigger = function (runtime, payload) {
    if (!payload.scheduledExecutionTime) {
        throw new Error('Scheduled execution time is required');
    }
    var evmConfig = runtime.config.evms[0];
    var network = (0, cre_sdk_1.getNetwork)({
        chainFamily: 'evm',
        chainSelectorName: evmConfig.chainSelectorName,
        isTestnet: evmConfig.isTestnet,
    });
    if (!network) {
        throw new Error("Network not found: ".concat(evmConfig.chainSelectorName));
    }
    var evmClient = new cre_sdk_1.EVMClient(network.chainSelector.selector);
    var marketCount = getMarketCount(runtime, evmClient, evmConfig.marketFactoryAddress);
    runtime.log("Found ".concat(marketCount.toString(), " binary markets"));
    var summaries = [];
    for (var i = 0n; i < marketCount; i++) {
        var marketAddress = getMarketAddress(runtime, evmClient, evmConfig.marketFactoryAddress, i);
        var info = getMarketInfo(runtime, evmClient, marketAddress);
        summaries.push({
            id: i,
            address: marketAddress,
            status: Number(info.status),
            bettingDeadline: info.bettingDeadline,
            endTime: info.endTime,
        });
    }
    var now = BigInt(Math.floor(Date.now() / 1000));
    var weatherOutcome = getTomorrowRainOutcome(runtime);
    var actions = [];
    for (var _i = 0, summaries_1 = summaries; _i < summaries_1.length; _i++) {
        var market = summaries_1[_i];
        if (market.status === MARKET_STATUS_OPEN && now >= market.bettingDeadline) {
            var txHash = writeMarketReport(runtime, evmClient, market.address, evmConfig.gasLimit, ACTION_LOCK, 0);
            actions.push("lock#".concat(market.id.toString(), ":").concat(txHash));
            continue;
        }
        if (market.status === MARKET_STATUS_LOCKED && market.endTime > 0n && now >= market.endTime) {
            var txHash = writeMarketReport(runtime, evmClient, market.address, evmConfig.gasLimit, ACTION_RESOLVE, weatherOutcome);
            actions.push("resolve#".concat(market.id.toString(), "=").concat(weatherOutcome, ":").concat(txHash));
        }
    }
    if (actions.length === 0) {
        runtime.log('No markets required lock or resolve in this run');
        return 'No actions executed';
    }
    return actions.join(' | ');
};
var getMarketCount = function (runtime, evmClient, factoryAddress) {
    var callData = (0, viem_1.encodeFunctionData)({
        abi: FACTORY_ABI,
        functionName: 'getMarketCount',
        args: [],
    });
    var result = evmClient.callContract(runtime, {
        call: (0, cre_sdk_1.encodeCallMsg)({
            from: viem_1.zeroAddress,
            to: factoryAddress,
            data: callData,
        }),
    }).result();
    if (!result.data || result.data.length === 0) {
        throw new Error('getMarketCount returned no data');
    }
    return (0, viem_1.decodeFunctionResult)({
        abi: FACTORY_ABI,
        functionName: 'getMarketCount',
        data: (0, viem_1.toHex)(result.data),
    });
};
var getMarketAddress = function (runtime, evmClient, factoryAddress, marketId) {
    var callData = (0, viem_1.encodeFunctionData)({
        abi: FACTORY_ABI,
        functionName: 'getMarket',
        args: [marketId],
    });
    var result = evmClient.callContract(runtime, {
        call: (0, cre_sdk_1.encodeCallMsg)({
            from: viem_1.zeroAddress,
            to: factoryAddress,
            data: callData,
        }),
    }).result();
    if (!result.data || result.data.length === 0) {
        throw new Error("getMarket returned no data for market ".concat(marketId.toString()));
    }
    return (0, viem_1.decodeFunctionResult)({
        abi: FACTORY_ABI,
        functionName: 'getMarket',
        data: (0, viem_1.toHex)(result.data),
    });
};
var getMarketInfo = function (runtime, evmClient, marketAddress) {
    var callData = (0, viem_1.encodeFunctionData)({
        abi: MARKET_ABI,
        functionName: 'getMarketInfo',
        args: [],
    });
    var result = evmClient.callContract(runtime, {
        call: (0, cre_sdk_1.encodeCallMsg)({
            from: viem_1.zeroAddress,
            to: marketAddress,
            data: callData,
        }),
    }).result();
    if (!result.data || result.data.length === 0) {
        throw new Error("getMarketInfo returned no data for ".concat(marketAddress));
    }
    return (0, viem_1.decodeFunctionResult)({
        abi: MARKET_ABI,
        functionName: 'getMarketInfo',
        data: (0, viem_1.toHex)(result.data),
    });
};
var getTomorrowRainOutcome = function (runtime) {
    var _a, _b;
    var httpClient = new cre_sdk_1.HTTPClient();
    runtime.log("Fetching weather forecast from ".concat(runtime.config.weatherApiUrl));
    var response = httpClient.sendRequest(runtime, {
        method: 'GET',
        url: runtime.config.weatherApiUrl,
    }).result();
    if (response.statusCode !== 200) {
        throw new Error("Weather API failed with status ".concat(response.statusCode));
    }
    var weather = JSON.parse(Buffer.from(response.body).toString('utf-8'));
    var rainSeries = (_a = weather.daily) === null || _a === void 0 ? void 0 : _a.rain_sum;
    if (!rainSeries || rainSeries.length < 2) {
        throw new Error('Weather API response did not include tomorrow rain_sum');
    }
    var tomorrowRain = Number((_b = rainSeries[1]) !== null && _b !== void 0 ? _b : 0);
    var threshold = Number(runtime.config.rainThresholdMm);
    var outcome = tomorrowRain > threshold ? 1 : 0;
    runtime.log("Tomorrow rain_sum in Cannes: ".concat(tomorrowRain, "mm (threshold ").concat(threshold, ") -> outcome ").concat(outcome));
    return outcome;
};
var writeMarketReport = function (runtime, evmClient, marketAddress, gasLimit, action, outcome) {
    var reportData = (0, viem_1.encodeAbiParameters)((0, viem_1.parseAbiParameters)('uint8 action, uint8 outcome'), [action, outcome]);
    var reportResponse = runtime.report({
        encodedPayload: (0, cre_sdk_1.hexToBase64)(reportData),
        encoderName: 'evm',
        signingAlgo: 'ecdsa',
        hashingAlgo: 'keccak256',
    }).result();
    var writeResult = evmClient.writeReport(runtime, {
        receiver: marketAddress,
        report: reportResponse,
        gasConfig: {
            gasLimit: gasLimit,
        },
    }).result();
    if (writeResult.txStatus !== cre_sdk_1.TxStatus.SUCCESS) {
        throw new Error("Failed to write market report for ".concat(marketAddress, ": ").concat(writeResult.errorMessage || writeResult.txStatus));
    }
    var txHash = writeResult.txHash
        ? (0, viem_1.toHex)(writeResult.txHash)
        : '0x0000000000000000000000000000000000000000000000000000000000000000';
    runtime.log("Wrote report to ".concat(marketAddress, ": action=").concat(action, ", outcome=").concat(outcome, ", tx=").concat(txHash));
    return txHash;
};
