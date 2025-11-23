// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { OApp, Origin, MessagingFee, MessagingReceipt } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { OAppOptionsType3 } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";
import { OFTMsgCodec } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/libs/OFTMsgCodec.sol";
import { SendParam, OFTReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";

import { IStargate } from "./interfaces/IStargate.sol";
import { SwapPayloadCodec } from "./libraries/SwapPayloadCodec.sol";

/// @notice Arbitrum-side dispatcher that wraps Stargate sends with a canonical SwapVM payload.
contract OAquaSender is OApp, OAppOptionsType3 {
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error InvalidToken(address token);
    error InvalidDestination(address executor);
    error InsufficientMsgValue(uint256 required, uint256 supplied);
    error InvalidBridgeAmount(uint256 amountLD);

    event SwapDispatched(
        bytes32 indexed guid,
        address indexed caller,
        uint256 amountLD,
        bytes32 payloadId,
        uint32 indexed dstEid
    );

    IERC20 public immutable TOKEN_IN;
    IStargate public immutable STARGATE_POOL;
    address public immutable DESTINATION_EXECUTOR;
    uint32 public immutable DESTINATION_EID;
    address public immutable DESTINATION_TOKEN_IN;
    address public immutable DESTINATION_TOKEN_OUT;

    constructor(
        address _endpoint,
        address _owner,
        address _tokenIn,
        address _stargatePool,
        address _destinationExecutor,
        uint32 _destinationEid,
        address _destinationTokenIn,
        address _destinationTokenOut
    ) OApp(_endpoint, _owner) Ownable(_owner) {
        if (
            _endpoint == address(0) ||
            _owner == address(0) ||
            _tokenIn == address(0) ||
            _stargatePool == address(0) ||
            _destinationExecutor == address(0) ||
            _destinationTokenIn == address(0) ||
            _destinationTokenOut == address(0)
        ) revert InvalidAddress();
        if (_destinationEid == 0) revert InvalidDestination(_destinationExecutor);

        TOKEN_IN = IERC20(_tokenIn);
        STARGATE_POOL = IStargate(_stargatePool);
        DESTINATION_EXECUTOR = _destinationExecutor;
        DESTINATION_EID = _destinationEid;
        DESTINATION_TOKEN_IN = _destinationTokenIn;
        DESTINATION_TOKEN_OUT = _destinationTokenOut;

        TOKEN_IN.forceApprove(_stargatePool, type(uint256).max);
    }

    /// @notice Quotes the LayerZero messaging fee for a compose-enabled Stargate send.
    function quoteSendSwap(
        SwapPayloadCodec.SwapPayload calldata payload,
        bytes calldata extraOptions,
        uint256 minAmountLD
    ) external view returns (MessagingFee memory) {
        SwapPayloadCodec.SwapPayload memory payloadMem = payload;
        (SendParam memory sendParam, ) = _prepareSendParam(payloadMem, payload.amountLD, extraOptions, minAmountLD);
        return STARGATE_POOL.quoteSend(sendParam, false);
    }

    /// @notice Moves local USDC into Stargate and attaches the SwapVM payload for Base.
    function sendSwap(
        SwapPayloadCodec.SwapPayload calldata payload,
        bytes calldata extraOptions,
        uint256 minAmountLD
    ) external payable returns (bytes32 guid) {
        // Payload should already have the expected received amount set by the caller
        // We don't modify it here - the caller is responsible for setting amountLD
        // to the quoted amountReceivedLD from Stargate

        (SendParam memory sendParam, ) = _prepareSendParam(
            payload,
            payload.amountLD, // Amount to bridge
            extraOptions,
            minAmountLD // Minimum acceptable amount (slippage protection)
        );

        MessagingFee memory feeQuote = STARGATE_POOL.quoteSend(sendParam, false);
        if (msg.value < feeQuote.nativeFee) revert InsufficientMsgValue(feeQuote.nativeFee, msg.value);

        // Transfer the amount from user
        TOKEN_IN.safeTransferFrom(msg.sender, address(this), payload.amountLD);

        (MessagingReceipt memory receipt, ) = STARGATE_POOL.send{ value: feeQuote.nativeFee }(
            sendParam,
            feeQuote,
            payable(msg.sender)
        );

        // Refund excess
        uint256 excess = msg.value - feeQuote.nativeFee;
        if (excess > 0) {
            (bool success, ) = msg.sender.call{ value: excess }("");
            require(success, "Excess refund failed");
        }

        bytes32 payloadId = SwapPayloadCodec.id(payload);
        emit SwapDispatched(receipt.guid, msg.sender, payload.amountLD, payloadId, DESTINATION_EID);

        return receipt.guid;
    }

    function _prepareSendParam(
        SwapPayloadCodec.SwapPayload memory payload,
        uint256 amountToSendLD,
        bytes calldata extraOptions,
        uint256 minAmountLD
    ) internal view returns (SendParam memory sendParam, uint256 guaranteedAmountLD) {
        // Payload comes in with DESTINATION addresses, but we need to validate against SOURCE token
        // that we're actually bridging from this chain
        if (payload.tokenIn != DESTINATION_TOKEN_IN) revert InvalidToken(payload.tokenIn);
        if (payload.maker != DESTINATION_EXECUTOR) revert InvalidDestination(payload.maker);

        // Payload is already correct with destination addresses, so we just encode it as-is
        sendParam = SendParam({
            dstEid: DESTINATION_EID,
            to: OFTMsgCodec.addressToBytes32(DESTINATION_EXECUTOR),
            amountLD: amountToSendLD,
            minAmountLD: minAmountLD,
            extraOptions: extraOptions,
            composeMsg: SwapPayloadCodec.encode(payload),
            oftCmd: bytes("")
        });

        guaranteedAmountLD = minAmountLD;
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata) internal virtual override {
        revert("OAquaSender: no inbound flows");
    }
}
