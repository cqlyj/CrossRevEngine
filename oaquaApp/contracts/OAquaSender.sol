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
/// @dev    Guidance: README.md + `knowledge/oapp_composer.txt`.
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

    constructor(
        address _endpoint,
        address _owner,
        address _tokenIn,
        address _stargatePool,
        address _destinationExecutor,
        uint32 _destinationEid
    ) OApp(_endpoint, _owner) Ownable(_owner) {
        if (
            _endpoint == address(0) ||
            _owner == address(0) ||
            _tokenIn == address(0) ||
            _stargatePool == address(0) ||
            _destinationExecutor == address(0)
        ) revert InvalidAddress();
        if (_destinationEid == 0) revert InvalidDestination(_destinationExecutor);

        TOKEN_IN = IERC20(_tokenIn);
        STARGATE_POOL = IStargate(_stargatePool);
        DESTINATION_EXECUTOR = _destinationExecutor;
        DESTINATION_EID = _destinationEid;

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
        SwapPayloadCodec.SwapPayload memory adjustedPayload = payload;

        // Update payload to match the actual amount landing on destination
        if (minAmountLD > 0) {
            adjustedPayload.amountLD = minAmountLD;
            if (adjustedPayload.strategyBalances.length > 0) {
                adjustedPayload.strategyBalances[0] = minAmountLD;
            }
        }

        (SendParam memory sendParam, ) = _prepareSendParam(
            adjustedPayload,
            payload.amountLD, // ORIGINAL amount to send/debit
            extraOptions,
            minAmountLD
        );

        MessagingFee memory feeQuote = STARGATE_POOL.quoteSend(sendParam, false);
        if (msg.value < feeQuote.nativeFee) revert InsufficientMsgValue(feeQuote.nativeFee, msg.value);

        // Transfer the *original* amount from user (sender covers fees)
        TOKEN_IN.safeTransferFrom(msg.sender, address(this), payload.amountLD);

        // DEBUG: Uncommented send, but using empty options to debug
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

        bytes32 payloadId = SwapPayloadCodec.id(adjustedPayload);
        emit SwapDispatched(receipt.guid, msg.sender, adjustedPayload.amountLD, payloadId, DESTINATION_EID);

        return receipt.guid;
    }

    function _prepareSendParam(
        SwapPayloadCodec.SwapPayload memory payload,
        uint256 amountToSendLD,
        bytes calldata extraOptions,
        uint256 minAmountLD
    ) internal view returns (SendParam memory sendParam, uint256 guaranteedAmountLD) {
        if (payload.tokenIn != address(TOKEN_IN)) revert InvalidToken(payload.tokenIn);
        if (payload.maker != DESTINATION_EXECUTOR) revert InvalidDestination(payload.maker);

        sendParam = SendParam({
            dstEid: DESTINATION_EID,
            to: OFTMsgCodec.addressToBytes32(DESTINATION_EXECUTOR),
            amountLD: amountToSendLD,
            minAmountLD: minAmountLD,
            extraOptions: extraOptions,
            // extraOptions: bytes(""), // DEBUG: FORCE EMPTY OPTIONS
            composeMsg: SwapPayloadCodec.encode(payload),
            oftCmd: bytes("")
        });

        guaranteedAmountLD = minAmountLD;
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata) internal virtual override {
        revert("OAquaSender: no inbound flows");
    }
}
