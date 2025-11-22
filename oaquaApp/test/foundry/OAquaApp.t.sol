// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";

import { OAquaApp } from "../../contracts/OAquaApp.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract OAquaAppForkTest is Test {
    uint32 private constant SRC_EID = 30110; // Arbitrum V2 mainnet (EndpointV2IdBase + 110)

    address private constant FALLBACK_ENDPOINT = 0x1a44076050125825900e736c501f859c50fe728c;
    address private constant FALLBACK_STARGATE = 0x0000000000000000000000000000000000000530;
    address private constant FALLBACK_ARBITRUM_POOL = 0x0000000000000000000000000000000000000531;
    address private constant FALLBACK_AQUA = 0x499943e74fb0ce105688beee8ef2abec5d936d31;

    OAquaApp private oapp;
    IERC20 private usdc;
    IERC20 private usdt;
    address private endpoint;
    address private stargatePool;
    bytes32 private composeFrom;

    function setUp() public {
        string memory baseRpc = vm.envString("RPC_URL_BASE");
        uint256 forkId = vm.createFork(baseRpc);
        vm.selectFork(forkId);

        endpoint = _envAddress("LZ_ENDPOINT_BASE", FALLBACK_ENDPOINT, true);
        stargatePool = _envAddress("BASE_STARGATE_POOL", FALLBACK_STARGATE, true);
        composeFrom = bytes32(uint256(uint160(_envAddress("ARBITRUM_STARGATE_POOL", FALLBACK_ARBITRUM_POOL, true))));

        address aquaAddr = _envAddress("BASE_AQUA_ADDRESS", FALLBACK_AQUA, true);
        address usdcAddr = _envAddress("USDC_ADDRESS_BASE", address(0), false);
        address usdtAddr = _envAddress("USDT_ADDRESS_BASE", address(0), false);

        require(usdcAddr != address(0) && usdtAddr != address(0), "token addresses required");

        oapp = new OAquaApp(endpoint, stargatePool, aquaAddr, usdcAddr, usdtAddr, address(this));
        usdc = IERC20(usdcAddr);
        usdt = IERC20(usdtAddr);
    }

    function testEndToEndFlow() public {
        bytes32 guid = keccak256("cre-full-stack");
        OAquaApp.SwapIntent memory intent = OAquaApp.SwapIntent({
            tokenIn: address(usdt),
            tokenOut: address(usdc),
            amountOut: 1_000_000, // 1 USDC with 6 decimals
            minAmountIn: 990_000, // accept slight slippage
            expiry: uint64(block.timestamp + 1 hours),
            salt: keccak256("arb-dao-signal")
        });

        bytes memory composeMsg = abi.encode(intent);
        bytes memory message = abi.encodePacked(
            uint64(block.timestamp),
            SRC_EID,
            uint256(intent.amountOut),
            composeFrom,
            composeMsg
        );

        deal(address(usdc), address(oapp), intent.amountOut);

        vm.prank(endpoint);
        oapp.lzCompose(stargatePool, guid, message, address(0), bytes(""));

        address solver = makeAddr("solver");
        uint256 solverPayment = uint256(intent.minAmountIn) + 1;
        deal(address(usdt), solver, solverPayment);

        vm.startPrank(solver);
        usdt.approve(address(oapp), solverPayment);
        oapp.fillStrategy(guid, solverPayment, solver);
        vm.stopPrank();

        assertEq(usdc.balanceOf(solver), intent.amountOut, "solver output mismatch");
        assertEq(usdt.balanceOf(address(oapp)), solverPayment, "vault input mismatch");

        OAquaApp.StrategyState memory state = oapp.getStrategy(guid);
        assertTrue(state.filled && !state.active, "strategy not finalized");
        assertEq(state.amountInReceived, solverPayment, "recorded input mismatch");
    }

    function _envAddress(string memory key, address fallbackAddr, bool allowFallback) internal returns (address) {
        string memory raw;
        try vm.envString(key) returns (string memory value) {
            raw = value;
        } catch {
            if (allowFallback) return fallbackAddr;
            revert(string.concat("Missing env for ", key));
        }

        bytes memory data = bytes(raw);
        if (data.length == 0) {
            if (allowFallback) return fallbackAddr;
            revert(string.concat("Empty env for ", key));
        }

        if (data.length == 40) {
            raw = string.concat("0x", raw);
            data = bytes(raw);
        }

        if (data.length == 42 && data[0] == "0" && (data[1] == "x" || data[1] == "X")) {
            return vm.parseAddress(raw);
        }

        if (allowFallback) {
            return fallbackAddr;
        }

        revert(string.concat("Invalid address for ", key));
    }
}
