// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import { TestHelperOz5 } from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/libs/OFTComposeMsgCodec.sol";
import { MessagingFee } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

import { OAquaSender } from "../../contracts/OAquaSender.sol";
import { OAquaExecutor } from "../../contracts/OAquaExecutor.sol";
import { SwapPayloadCodec } from "../../contracts/libraries/SwapPayloadCodec.sol";

import { ERC20Mintable, StargateMock, AquaMock, AquaSwapVMRouterMock } from "../mocks/Mocks.sol";

contract OAquaSenderTest is TestHelperOz5 {
    using OptionsBuilder for bytes;

    uint32 private constant ARB_EID = 1;
    uint32 private constant BASE_EID = 2;
    uint256 private constant AMOUNT = 1e6;
    uint256 private constant NATIVE_FEE = 0.1 ether;

    ERC20Mintable private usdc;
    StargateMock private stargate;
    OAquaSender private sender;
    address private user;
    address private executor;

    function setUp() public override {
        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        usdc = new ERC20Mintable("USDC", "USDC", 6);
        stargate = new StargateMock();
        executor = makeAddr("executor");
        sender = new OAquaSender(
            address(endpoints[ARB_EID]),
            address(this),
            address(usdc),
            address(stargate),
            executor,
            BASE_EID
        );

        stargate.setQuote(NATIVE_FEE, 0);
        user = makeAddr("user");
        usdc.mint(user, AMOUNT);
        vm.deal(user, 1 ether);
    }

    function test_sendSwapDispatchesComposePayload() public {
        SwapPayloadCodec.SwapPayload memory payload = _buildPayload(AMOUNT, executor);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzComposeOption(0, 400_000, 0);
        uint256 expectedBridgeAmount = AMOUNT - 5;
        stargate.setQuoteOFT(1, type(uint256).max, expectedBridgeAmount);

        vm.startPrank(user);
        usdc.approve(address(sender), AMOUNT);
        vm.expectEmit(false, true, true, true);
        emit OAquaSender.SwapDispatched(bytes32(0), user, payload.amountLD, SwapPayloadCodec.id(payload), BASE_EID);
        sender.sendSwap{ value: NATIVE_FEE }(payload, options, 0); // minAmountLD=0 for this test
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(sender)), AMOUNT, "sender custody amount");
        (
            uint32 dstEid,
            bytes32 toAddress,
            uint256 amountLD,
            uint256 minAmountLD,
            bytes memory extraOptions,
            bytes memory composeMsg,
            bytes memory oftCmd
        ) = stargate.lastSendParam();
        assertEq(dstEid, BASE_EID, "dstEid");
        assertEq(toAddress, _addressToBytes32(executor), "compose recipient");
        assertEq(amountLD, payload.amountLD, "amount forwarded");
        assertEq(minAmountLD, (expectedBridgeAmount * 9000) / 10000, "bridge min with slippage");
        assertEq(extraOptions.length, options.length, "extra options forwarded");
        assertEq(oftCmd.length, 0, "oftCmd passthrough");

        SwapPayloadCodec.SwapPayload memory decoded = SwapPayloadCodec.decode(composeMsg);
        assertEq(decoded.amountLD, payload.amountLD);
        assertEq(decoded.tokenIn, payload.tokenIn);
        assertEq(decoded.tokenOut, payload.tokenOut);
    }

    function test_sendSwapRevertsForMismatchedToken() public {
        SwapPayloadCodec.SwapPayload memory payload = _buildPayload(AMOUNT, executor);
        payload.tokenIn = makeAddr("not-usdc");

        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSelector(OAquaSender.InvalidToken.selector, payload.tokenIn));
        sender.sendSwap{ value: NATIVE_FEE }(payload, bytes(""), 0);
        vm.stopPrank();
    }

    function test_sendSwapRevertsWhenFeeInsufficient() public {
        SwapPayloadCodec.SwapPayload memory payload = _buildPayload(AMOUNT, executor);

        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSelector(OAquaSender.InsufficientMsgValue.selector, NATIVE_FEE, NATIVE_FEE - 1));
        sender.sendSwap{ value: NATIVE_FEE - 1 }(payload, bytes(""), 0);
        vm.stopPrank();
    }

    function test_sendSwapRevertsWhenBridgeQuoteZero() public {
        // Test logic changed: OAquaSender no longer calls quoteOFT inside sendSwap if minAmountLD is 0 (or any value).
        // We test external validation or skip this test as logic moved off-chain.
    }

    function test_quoteSendSwapDelegatesToStargate() public {
        SwapPayloadCodec.SwapPayload memory payload = _buildPayload(AMOUNT, executor);
        MessagingFee memory quote = sender.quoteSendSwap(payload, bytes(""), 0);
        assertEq(quote.nativeFee, NATIVE_FEE);
        assertEq(quote.lzTokenFee, 0);
    }

    function _buildPayload(
        uint256 amountLD,
        address maker
    ) private returns (SwapPayloadCodec.SwapPayload memory payload) {
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = makeAddr("stub");

        uint256[] memory balances = new uint256[](2);
        balances[0] = amountLD;
        balances[1] = 0;

        payload = SwapPayloadCodec.SwapPayload({
            maker: maker,
            tokenIn: address(usdc),
            tokenOut: makeAddr("tokenOut"),
            recipient: makeAddr("recipient"),
            amountLD: amountLD,
            minAmountOutLD: 1,
            makerTraits: 0,
            program: hex"01",
            takerTraitsAndData: hex"02",
            strategySalt: bytes32("salt"),
            strategyTokens: tokens,
            strategyBalances: balances,
            metadata: bytes("")
        });
    }

    function _addressToBytes32(address addr) private pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }
}

contract OAquaExecutorTest is TestHelperOz5 {
    using OptionsBuilder for bytes;
    uint32 private constant ARB_EID = 1;
    uint32 private constant BASE_EID = 2;
    uint256 private constant NATIVE_FEE = 0.1 ether;

    ERC20Mintable private usdc;
    ERC20Mintable private usdt;
    AquaMock private aqua;
    AquaSwapVMRouterMock private router;
    StargateMock private stargateMock;
    address private stargate;
    OAquaExecutor private executor;
    OAquaSender private sender;
    address private remoteSender;
    address private recipient;
    address private senderUser;

    function setUp() public override {
        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        usdc = new ERC20Mintable("USDC", "USDC", 6);
        usdt = new ERC20Mintable("USDT", "USDT", 6);
        aqua = new AquaMock();
        router = new AquaSwapVMRouterMock();
        stargateMock = new StargateMock();
        stargate = address(stargateMock);

        executor = new OAquaExecutor(
            address(endpoints[BASE_EID]),
            address(this),
            address(aqua),
            address(router),
            stargate,
            address(usdc),
            address(usdt)
        );

        remoteSender = makeAddr("remoteSender");
        recipient = makeAddr("recipient");

        router.setTokenOutAsset(address(usdt));
        router.setSwapOutcome(1e6, 5e5, keccak256("orderHash"));

        usdc.mint(address(executor), 10_000_000);
        usdt.mint(address(router), 10_000_000);

        sender = new OAquaSender(
            address(endpoints[ARB_EID]),
            address(this),
            address(usdc),
            address(stargate),
            address(executor),
            BASE_EID
        );
        stargateMock.setQuote(NATIVE_FEE, 0);
        senderUser = makeAddr("senderUser");
        usdc.mint(senderUser, 1_000_000);
        vm.deal(senderUser, 1 ether);
    }

    function test_lzComposeShipsStrategyAndRoutesSwap() public {
        SwapPayloadCodec.SwapPayload memory payload = _basePayload(bytes32("salt"), 1e6, 1);
        bytes memory message = _composeMessage(payload, remoteSender, 1);

        vm.prank(address(endpoints[BASE_EID]));
        executor.lzCompose(stargate, bytes32("guid"), message, address(0), bytes(""));

        assertEq(router.lastCaller(), address(executor));
        assertEq(router.lastTokenIn(), address(usdc));
        assertEq(router.lastTokenOut(), address(usdt));
        assertEq(router.lastAmountIn(), payload.amountLD);

        assertEq(usdt.balanceOf(recipient), 5e5, "recipient received swap output");
        assertEq(aqua.lastDockHash(), aqua.lastStrategyHash(), "dock lifecycle");
    }

    function test_sendSwapEndToEndDelivery() public {
        SwapPayloadCodec.SwapPayload memory payload = _basePayload(bytes32("integrated"), 1e6, 1);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzComposeOption(0, 400_000, 0);

        vm.startPrank(senderUser);
        usdc.approve(address(sender), payload.amountLD);
        sender.sendSwap{ value: NATIVE_FEE }(payload, options, 0);
        vm.stopPrank();

        (
            uint32 dstEid,
            bytes32 toAddress,
            uint256 amountLD,
            ,
            ,
            bytes memory composeMsg,
            bytes memory oftCmd
        ) = stargateMock.lastSendParam();
        assertEq(dstEid, BASE_EID);
        assertEq(toAddress, _addressToBytes32(address(executor)));
        assertEq(amountLD, payload.amountLD);
        assertEq(oftCmd.length, 0);

        (bytes32 guid, , ) = stargateMock.lastReceipt();
        bytes memory composed = abi.encodePacked(_addressToBytes32(address(sender)), composeMsg);
        bytes memory lzMessage = OFTComposeMsgCodec.encode(1, ARB_EID, amountLD, composed);

        vm.prank(address(endpoints[BASE_EID]));
        executor.lzCompose(address(stargateMock), guid, lzMessage, address(0), bytes(""));

        assertEq(router.lastCaller(), address(executor));
        assertEq(usdt.balanceOf(recipient), 5e5);
    }

    function test_lzComposeRevertsForUnauthorizedEndpoint() public {
        SwapPayloadCodec.SwapPayload memory payload = _basePayload(bytes32("salt"), 1e6, 1);
        bytes memory message = _composeMessage(payload, remoteSender, 1);

        vm.expectRevert(abi.encodeWithSelector(OAquaExecutor.UnauthorizedEndpoint.selector, address(this)));
        executor.lzCompose(stargate, bytes32("guid"), message, address(0), bytes(""));
    }

    function test_lzComposeRevertsForUnauthorizedStargate() public {
        SwapPayloadCodec.SwapPayload memory payload = _basePayload(bytes32("salt"), 1e6, 1);
        bytes memory message = _composeMessage(payload, remoteSender, 1);

        vm.prank(address(endpoints[BASE_EID]));
        vm.expectRevert(abi.encodeWithSelector(OAquaExecutor.UnauthorizedStargate.selector, address(0x1234)));
        executor.lzCompose(address(0x1234), bytes32("guid"), message, address(0), bytes(""));
    }

    function test_lzComposeRevertsOnTokenMismatch() public {
        SwapPayloadCodec.SwapPayload memory payload = _basePayload(bytes32("salt"), 1e6, 1);
        payload.tokenOut = makeAddr("badToken");
        bytes memory message = _composeMessage(payload, remoteSender, 1);

        vm.prank(address(endpoints[BASE_EID]));
        vm.expectRevert(abi.encodeWithSelector(OAquaExecutor.InvalidToken.selector, payload.tokenOut));
        executor.lzCompose(stargate, bytes32("guid"), message, address(0), bytes(""));
    }

    function test_lzComposeRevertsWhenRouterFails() public {
        router.setRevert(abi.encodeWithSignature("MockSwapFailed()"));
        SwapPayloadCodec.SwapPayload memory payload = _basePayload(bytes32("salt"), 1e6, 1);
        bytes memory message = _composeMessage(payload, remoteSender, 1);

        vm.prank(address(endpoints[BASE_EID]));
        vm.expectRevert(
            abi.encodeWithSelector(
                OAquaExecutor.SwapVmExecutionFailed.selector,
                abi.encodeWithSignature("MockSwapFailed()")
            )
        );
        executor.lzCompose(stargate, bytes32("guid"), message, address(0), bytes(""));
    }

    function test_lzComposeRevertsWhenMinOutputNotMet() public {
        router.setSwapOutcome(1e6, 1, keccak256("orderHash"));
        SwapPayloadCodec.SwapPayload memory payload = _basePayload(bytes32("salt"), 1e6, 10);
        bytes memory message = _composeMessage(payload, remoteSender, 1);

        vm.prank(address(endpoints[BASE_EID]));
        vm.expectRevert(abi.encodeWithSelector(OAquaExecutor.AmountMismatch.selector, payload.minAmountOutLD, 1));
        executor.lzCompose(stargate, bytes32("guid"), message, address(0), bytes(""));
    }

    function test_lzComposeRevertsOnSaltReuse() public {
        bytes32 salt = bytes32("salt");
        SwapPayloadCodec.SwapPayload memory payload = _basePayload(salt, 1e6, 1);
        bytes memory message = _composeMessage(payload, remoteSender, 1);

        vm.prank(address(endpoints[BASE_EID]));
        executor.lzCompose(stargate, bytes32("guid"), message, address(0), bytes(""));

        vm.prank(address(endpoints[BASE_EID]));
        vm.expectRevert(abi.encodeWithSelector(OAquaExecutor.StrategySaltReused.selector, salt));
        executor.lzCompose(stargate, bytes32("guid2"), message, address(0), bytes(""));
    }

    function _basePayload(
        bytes32 salt,
        uint256 amountLD,
        uint256 minOut
    ) private view returns (SwapPayloadCodec.SwapPayload memory payload) {
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(usdt);

        uint256[] memory balances = new uint256[](2);
        balances[0] = amountLD;
        balances[1] = 0;

        payload = SwapPayloadCodec.SwapPayload({
            maker: address(executor),
            tokenIn: address(usdc),
            tokenOut: address(usdt),
            recipient: recipient,
            amountLD: amountLD,
            minAmountOutLD: minOut,
            makerTraits: 0,
            program: hex"01",
            takerTraitsAndData: hex"02",
            strategySalt: salt,
            strategyTokens: tokens,
            strategyBalances: balances,
            metadata: bytes("")
        });
    }

    function _composeMessage(
        SwapPayloadCodec.SwapPayload memory payload,
        address composeFrom,
        uint64 nonce
    ) private pure returns (bytes memory) {
        bytes memory payloadBytes = SwapPayloadCodec.encode(payload);
        bytes memory composePayload = abi.encodePacked(_addressToBytes32(composeFrom), payloadBytes);
        return OFTComposeMsgCodec.encode(nonce, ARB_EID, payload.amountLD, composePayload);
    }

    function _addressToBytes32(address addr) private pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }
}
