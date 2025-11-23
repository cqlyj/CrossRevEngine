// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { IAqua } from "@layerzerolabs/toolbox-foundry/lib/aqua/src/interfaces/IAqua.sol";
import { IAquaSwapVMRouter } from "./interfaces/IAquaSwapVMRouter.sol";
import { IAquaAppSwapCallback } from "./interfaces/IAquaAppSwapCallback.sol";

/// @notice Swap executor for interacting with OAquaExecutor strategies
/// @dev Implements callback pattern for token transfers during swaps
contract OAquaSwapExecutor is IAquaAppSwapCallback, Ownable {
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error SwapFailed(bytes reason);
    error InsufficientOutput(uint256 amountOut, uint256 minAmountOut);

    event SwapExecuted(
        bytes32 indexed orderHash,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event QuoteObtained(
        bytes32 indexed orderHash,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    IAqua public immutable AQUA;
    IAquaSwapVMRouter public immutable ROUTER;

    mapping(address => bool) private _approvedTokens;

    constructor(address _aqua, address _router, address _owner) Ownable(_owner) {
        if (_aqua == address(0) || _router == address(0) || _owner == address(0)) {
            revert InvalidAddress();
        }
        AQUA = IAqua(_aqua);
        ROUTER = IAquaSwapVMRouter(_router);
    }

    /// @notice Approve a token for Aqua push operations
    function approveToken(address token) external onlyOwner {
        if (!_approvedTokens[token]) {
            IERC20(token).forceApprove(address(AQUA), type(uint256).max);
            _approvedTokens[token] = true;
        }
    }

    /// @notice Approve multiple tokens at once
    function approveTokens(address[] calldata tokens) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (!_approvedTokens[tokens[i]]) {
                IERC20(tokens[i]).forceApprove(address(AQUA), type(uint256).max);
                _approvedTokens[tokens[i]] = true;
            }
        }
    }

    /// @notice Get a quote for a swap
    /// @param order The maker's order (from StrategyShippedWithOrder event)
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountIn The input amount
    /// @return amountOut The expected output amount
    function getQuote(
        IAquaSwapVMRouter.Order calldata order,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external returns (uint256 amountOut) {
        bytes memory takerTraitsAndData = abi.encodePacked(
            uint256(0), // takerTraits (default)
            bytes("") // takerData (empty)
        );

        (uint256 actualAmountIn, uint256 actualAmountOut, bytes32 orderHash) = ROUTER.quote(
            order,
            tokenIn,
            tokenOut,
            amountIn,
            takerTraitsAndData
        );

        emit QuoteObtained(orderHash, tokenIn, tokenOut, actualAmountIn, actualAmountOut);
        return actualAmountOut;
    }

    /// @notice Execute a swap against a strategy
    /// @param order The maker's order (from StrategyShippedWithOrder event)
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountIn The input amount
    /// @param minAmountOut The minimum acceptable output amount
    /// @param recipient The address to receive output tokens
    /// @return amountOut The actual output amount received
    function executeSwap(
        IAquaSwapVMRouter.Order calldata order,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external returns (uint256 amountOut) {
        // Transfer input tokens from caller
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve token if not already approved
        if (!_approvedTokens[tokenIn]) {
            IERC20(tokenIn).forceApprove(address(AQUA), type(uint256).max);
            _approvedTokens[tokenIn] = true;
        }

        // Encode taker traits and data for callback
        bytes memory takerTraitsAndData = abi.encodePacked(
            uint256(0), // takerTraits (default)
            bytes("") // takerData (empty)
        );

        // Execute the swap through the router
        (uint256 actualAmountIn, uint256 actualAmountOut, bytes32 orderHash) = ROUTER.swap(
            order,
            tokenIn,
            tokenOut,
            amountIn,
            takerTraitsAndData
        );

        // Verify minimum output
        if (actualAmountOut < minAmountOut) {
            revert InsufficientOutput(actualAmountOut, minAmountOut);
        }

        // Transfer output tokens to recipient
        if (recipient != address(this)) {
            IERC20(tokenOut).safeTransfer(recipient, actualAmountOut);
        }

        emit SwapExecuted(orderHash, tokenIn, tokenOut, actualAmountIn, actualAmountOut);
        return actualAmountOut;
    }

    /// @notice Callback function called by AquaApp during swap execution
    /// @dev This function is called to complete the token transfer to the maker
    function aquaAppSwapCallback(
        address tokenIn,
        address, // tokenOut
        uint256 amountIn,
        uint256, // amountOut
        address maker,
        address app,
        bytes32 strategyHash,
        bytes calldata // takerData
    ) external override {
        // The callback is triggered by the Router during swap execution
        // We need to push the input tokens to the maker's Aqua balance
        AQUA.push(maker, app, strategyHash, tokenIn, amountIn);
    }

    /// @notice Rescue tokens sent to this contract by mistake
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Allow contract to receive ETH
    receive() external payable {}
}
