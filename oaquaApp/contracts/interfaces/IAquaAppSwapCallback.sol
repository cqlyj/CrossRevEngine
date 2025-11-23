// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Callback interface for Aqua App swaps
/// @dev Implemented by contracts that want to execute swaps against Aqua strategies
interface IAquaAppSwapCallback {
    /// @notice Called during swap execution to handle token transfers
    /// @param tokenIn The input token being provided by the taker
    /// @param tokenOut The output token being received by the taker
    /// @param amountIn The amount of input tokens required
    /// @param amountOut The amount of output tokens being transferred
    /// @param maker The address of the strategy maker
    /// @param app The address of the Aqua app (Router)
    /// @param strategyHash The hash identifying the strategy
    /// @param takerData Additional data passed by the taker
    function aquaAppSwapCallback(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address maker,
        address app,
        bytes32 strategyHash,
        bytes calldata takerData
    ) external;
}
