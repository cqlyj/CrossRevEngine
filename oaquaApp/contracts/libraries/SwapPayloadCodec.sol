// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @notice Shared struct + helpers that keep the OAqua sender/executor payloads symmetric.
/// @dev  Mirrors the guidance in `knowledge/aqua_sdk.txt` & `knowledge/oapp_composer.txt`.
library SwapPayloadCodec {
    error SwapPayloadCodec_InvalidArrayLengths();
    error SwapPayloadCodec_InvalidTokens();

    struct SwapPayload {
        address maker; // Expected maker on destination chain (Stage 1: OAquaExecutor itself)
        address tokenIn; // Token bridged with Stargate (e.g., USDC)
        address tokenOut; // Token expected after swap (e.g., USDT)
        address recipient; // Address that should keep post-swap proceeds
        uint256 amountLD; // Amount (local decimals) that will be swapped
        uint256 minAmountOutLD; // Optional slippage guard (local decimals)
        uint256 makerTraits; // SwapVM maker traits bitfield
        bytes program; // SwapVM program bytes
        bytes takerTraitsAndData; // SwapVM taker traits payload (already ABI encoded)
        bytes32 strategySalt; // Seed used to derive a unique Aqua strategy hash
        address[] strategyTokens; // Tokens array passed to `Aqua.ship`
        uint256[] strategyBalances; // Initial balances (virtual) aligned with `strategyTokens`
        bytes metadata; // Arbitrary future-proof metadata (off-chain tracing, router hints, etc.)
    }

    function encode(SwapPayload memory payload) internal pure returns (bytes memory) {
        return abi.encode(payload);
    }

    function decode(bytes memory data) internal pure returns (SwapPayload memory payload) {
        payload = abi.decode(data, (SwapPayload));
        _validate(payload);
    }

    function id(SwapPayload memory payload) internal pure returns (bytes32) {
        return keccak256(abi.encode(payload));
    }

    function _validate(SwapPayload memory payload) private pure {
        if (
            payload.maker == address(0) || payload.tokenIn == address(0) || payload.tokenOut == address(0)
                || payload.recipient == address(0) || payload.amountLD == 0 || payload.program.length == 0
        ) {
            revert SwapPayloadCodec_InvalidTokens();
        }

        if (payload.strategyTokens.length != payload.strategyBalances.length || payload.strategyTokens.length == 0) {
            revert SwapPayloadCodec_InvalidArrayLengths();
        }
    }
}
