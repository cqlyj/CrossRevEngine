// SPDX-License-Identifier: LicenseRef-Degensoft-Aqua-Source-1.1
pragma solidity ^0.8.22;

/// @custom:license-url https://github.com/1inch/aqua/blob/main/LICENSES/Aqua-Source-1.1.txt
/// @title Minimal IAqua interface required by OAquaApp
interface IAqua {
    event Shipped(address indexed maker, address indexed app, bytes32 indexed strategyHash, bytes strategy);
    event Docked(address indexed maker, address indexed app, bytes32 indexed strategyHash);
    event Pulled(address indexed maker, address indexed app, bytes32 indexed strategyHash, address token, uint256 amount);
    event Pushed(address indexed maker, address indexed app, bytes32 indexed strategyHash, address token, uint256 amount);

    function rawBalances(
        address maker,
        address app,
        bytes32 strategyHash,
        address token
    ) external view returns (uint248 balance, uint8 tokensCount);

    function safeBalances(
        address maker,
        address app,
        bytes32 strategyHash,
        address token0,
        address token1
    ) external view returns (uint256 balance0, uint256 balance1);

    function ship(
        address app,
        bytes calldata strategy,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external returns (bytes32 strategyHash);

    function dock(address app, bytes32 strategyHash, address[] calldata tokens) external;

    function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external;

    function push(address maker, address app, bytes32 strategyHash, address token, uint256 amount) external;
}

