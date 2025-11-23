// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockSender
 * @notice Mock OAquaSender for Sepolia testnet - does nothing, just emits events
 * @dev Used for CRE demo on testnet while real txs happen on mainnet
 */
contract MockSender {
    struct SwapPayload {
        address maker;
        address tokenIn;
        address tokenOut;
        address recipient;
        uint256 amountLD;
        uint256 minAmountOutLD;
        uint256 makerTraits;
        bytes program;
        bytes takerTraitsAndData;
        bytes32 strategySalt;
        address[] strategyTokens;
        uint256[] strategyBalances;
        bytes metadata;
    }

    event MockSwapCalled(address indexed maker, uint256 amount, bytes32 strategySalt, uint256 timestamp);

    function sendSwap(
        SwapPayload calldata _payload,
        bytes calldata /*_extraOptions*/,
        uint256 /*_minAmountLD*/
    ) external payable returns (bytes32 strategyHash) {
        // Generate mock strategy hash
        strategyHash = keccak256(abi.encode(_payload.maker, _payload.strategySalt, block.timestamp));

        emit MockSwapCalled(_payload.maker, _payload.amountLD, _payload.strategySalt, block.timestamp);

        return strategyHash;
    }

    function quoteSendSwap(
        SwapPayload calldata /*_payload*/,
        bytes calldata /*_extraOptions*/,
        uint256 /*_minAmountLD*/
    ) external pure returns (uint256 nativeFee, uint256 lzTokenFee) {
        // Return minimal fee for testing
        return (0.001 ether, 0);
    }
}
