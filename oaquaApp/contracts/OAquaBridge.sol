// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IOAquaSender {
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

    function sendSwap(
        SwapPayload calldata _payload,
        bytes calldata _extraOptions,
        uint256 _minAmountLD
    ) external payable returns (bytes32 strategyHash);

    function quoteSendSwap(
        SwapPayload calldata _payload,
        bytes calldata _extraOptions,
        uint256 _minAmountLD
    ) external view returns (uint256 nativeFee, uint256 lzTokenFee);
}

contract OAquaBridge {
    IOAquaSender public immutable oaquaSender;

    event StrategyDeployed(bytes32 indexed strategyHash, uint256 timestamp);
    event DeploymentFailed(string reason);

    constructor(address _oaquaSender) {
        oaquaSender = IOAquaSender(_oaquaSender);
    }

    function onReport(bytes calldata report) external {
        (IOAquaSender.SwapPayload memory payload, bytes memory extraOptions, uint256 minAmountLD) = abi.decode(
            report,
            (IOAquaSender.SwapPayload, bytes, uint256)
        );

        (uint256 nativeFee, ) = oaquaSender.quoteSendSwap(payload, extraOptions, minAmountLD);

        try oaquaSender.sendSwap{ value: nativeFee }(payload, extraOptions, minAmountLD) returns (
            bytes32 strategyHash
        ) {
            emit StrategyDeployed(strategyHash, block.timestamp);
        } catch Error(string memory reason) {
            emit DeploymentFailed(reason);
        }
    }

    receive() external payable {}
}
