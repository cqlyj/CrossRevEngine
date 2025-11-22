// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { OApp, Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { OAppOptionsType3 } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";
import { IOAppComposer } from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppComposer.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/libs/OFTComposeMsgCodec.sol";

import { AquaApp } from "@layerzerolabs/toolbox-foundry/lib/aqua/src/AquaApp.sol";
import { IAqua as IAquaExternal } from "@layerzerolabs/toolbox-foundry/lib/aqua/src/interfaces/IAqua.sol";

import { IAquaSwapVMRouter } from "./interfaces/IAquaSwapVMRouter.sol";
import { IStargate } from "./interfaces/IStargate.sol";
import { SwapPayloadCodec } from "./libraries/SwapPayloadCodec.sol";

/// @notice Base-side executor that authenticates Stargate compose calls and spins ephemeral Aqua strategies.
/// @dev    Contracts interacting with Aqua/SwapVM must stay aligned with `knowledge/aqua.txt`.
contract OAquaExecutor is OApp, OAppOptionsType3, AquaApp, IOAppComposer {
    using SafeERC20 for IERC20;

    // struct StrategyConfig {
    //     address maker;
    //     bytes32 salt;
    //     address tokenIn;
    //     address tokenOut;
    // }

    error InvalidAddress();
    error InvalidToken(address token);
    error UnauthorizedEndpoint(address caller);
    error UnauthorizedStargate(address caller);
    error MalformedComposeMessage();
    error InvalidMaker(address maker);
    error AmountMismatch(uint256 payloadAmount, uint256 receivedAmount);
    error StrategySaltReused(bytes32 salt);
    error MissingStrategyToken(address token);
    error InsufficientBalance(address token, uint256 expected, uint256 actual);
    error SwapVmExecutionFailed(bytes reason);

    event ComposeReceived(
        bytes32 indexed guid,
        address indexed origin,
        uint32 indexed srcEid,
        bytes32 payloadId,
        uint256 amountLD
    );
    event StrategyShipped(bytes32 indexed strategyHash, bytes32 payloadId);
    event SwapExecuted(bytes32 indexed strategyHash, bytes32 orderHash, uint256 amountIn, uint256 amountOut);
    event SwapVmFailed(bytes reason);
    event StrategyDocked(bytes32 indexed strategyHash);

    IERC20 public immutable TOKEN_IN;
    IERC20 public immutable TOKEN_OUT;
    IAquaSwapVMRouter public immutable ROUTER;
    IStargate public immutable STARGATE_POOL;

    mapping(bytes32 => bool) private _strategySaltUsed;
    mapping(bytes32 => bool) private _strategyActive;

    constructor(
        address _endpoint,
        address _owner,
        address _aqua,
        address _router,
        address _stargatePool,
        address _tokenIn,
        address _tokenOut
    ) OApp(_endpoint, _owner) AquaApp(IAquaExternal(_aqua)) Ownable(_owner) {
        if (
            _endpoint == address(0) ||
            _owner == address(0) ||
            _aqua == address(0) ||
            _router == address(0) ||
            _stargatePool == address(0) ||
            _tokenIn == address(0) ||
            _tokenOut == address(0)
        ) revert InvalidAddress();

        ROUTER = IAquaSwapVMRouter(_router);
        STARGATE_POOL = IStargate(_stargatePool);
        TOKEN_IN = IERC20(_tokenIn);
        TOKEN_OUT = IERC20(_tokenOut);

        TOKEN_IN.forceApprove(_aqua, type(uint256).max);
        TOKEN_OUT.forceApprove(_aqua, type(uint256).max);
    }

    function lzCompose(
        address _from,
        bytes32 _guid,
        bytes calldata _message,
        address,
        bytes calldata
    ) external payable override {
        if (msg.sender != address(endpoint)) revert UnauthorizedEndpoint(msg.sender);
        if (_from != address(STARGATE_POOL)) revert UnauthorizedStargate(_from);

        uint32 srcEid = OFTComposeMsgCodec.srcEid(_message);
        uint256 amountLD = OFTComposeMsgCodec.amountLD(_message);
        bytes memory composed = OFTComposeMsgCodec.composeMsg(_message);
        if (composed.length == 0) revert MalformedComposeMessage();

        bytes32 composeFromBytes = OFTComposeMsgCodec.composeFrom(_message);
        address origin = OFTComposeMsgCodec.bytes32ToAddress(composeFromBytes);

        SwapPayloadCodec.SwapPayload memory payload = SwapPayloadCodec.decode(composed);

        if (payload.maker != address(this)) revert InvalidMaker(payload.maker);

        // Allow a small tolerance (0.1% = 10 bps) for Stargate fee variance between quote and actual delivery
        // Stargate fees can vary slightly between quoting and actual execution
        uint256 minAcceptable = (payload.amountLD * 9990) / 10000; // 99.9% of expected
        if (amountLD < minAcceptable) revert AmountMismatch(payload.amountLD, amountLD);

        // Update payload to match the actual received amount
        payload.amountLD = amountLD;

        // Also update the strategy balance for the input token to match
        for (uint256 i = 0; i < payload.strategyTokens.length; ++i) {
            if (payload.strategyTokens[i] == payload.tokenIn) {
                payload.strategyBalances[i] = amountLD;
            }
        }
        if (payload.tokenIn != address(TOKEN_IN)) revert InvalidToken(payload.tokenIn);
        if (payload.tokenOut != address(TOKEN_OUT)) revert InvalidToken(payload.tokenOut);

        bytes32 payloadId = SwapPayloadCodec.id(payload);
        emit ComposeReceived(_guid, origin, srcEid, payloadId, amountLD);

        bytes32 strategyHash = _shipStrategy(payload);
        if (strategyHash == bytes32(0)) {
            return;
        }
        emit StrategyShipped(strategyHash, payloadId);

        // NOTE: We only ship the strategy (provide liquidity), we don't execute swaps here.
        // Traders will interact with the strategy directly through the Router.
        // To withdraw liquidity later, call dock() manually.
    }

    function dock(bytes32 strategyHash, address[] calldata tokens) external onlyOwner {
        AQUA.dock(address(this), strategyHash, tokens);
        emit StrategyDocked(strategyHash);
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    function _shipStrategy(SwapPayloadCodec.SwapPayload memory payload) private returns (bytes32 strategyHash) {
        if (_strategySaltUsed[payload.strategySalt]) revert StrategySaltReused(payload.strategySalt);
        _strategySaltUsed[payload.strategySalt] = true;

        _validateStrategyArrays(payload);
        _ensureBalances(payload);

        IAquaSwapVMRouter.Order memory order = IAquaSwapVMRouter.Order({
            maker: address(this),
            traits: payload.makerTraits,
            data: payload.program
        });

        (bool success, bytes memory result) = address(AQUA).call(
            abi.encodeWithSelector(
                IAquaExternal.ship.selector,
                address(ROUTER),
                abi.encode(order),
                payload.strategyTokens,
                payload.strategyBalances
            )
        );

        if (!success) {
            emit SwapVmFailed(result);
            return bytes32(0);
        }

        strategyHash = abi.decode(result, (bytes32));
        _strategyActive[strategyHash] = true;
    }

    function _executeSwap(
        bytes32 strategyHash,
        SwapPayloadCodec.SwapPayload memory payload
    )
        private
        nonReentrantStrategy(strategyHash)
        returns (uint256 amountInUsed, uint256 amountOutReceived, bytes32 orderHash)
    {
        IAquaSwapVMRouter.Order memory order = IAquaSwapVMRouter.Order({
            maker: address(this),
            traits: payload.makerTraits,
            data: payload.program
        });

        (bool success, bytes memory result) = address(ROUTER).call(
            abi.encodeWithSelector(
                IAquaSwapVMRouter.swap.selector,
                order,
                payload.tokenIn,
                payload.tokenOut,
                payload.amountLD,
                payload.takerTraitsAndData
            )
        );

        if (!success) {
            _dockStrategy(strategyHash, payload);
            emit SwapVmFailed(result);
            return (0, 0, bytes32(0));
        }

        (amountInUsed, amountOutReceived, orderHash) = abi.decode(result, (uint256, uint256, bytes32));

        if (payload.minAmountOutLD > 0 && amountOutReceived < payload.minAmountOutLD) {
            revert AmountMismatch(payload.minAmountOutLD, amountOutReceived);
        }

        if (payload.recipient != address(this) && amountOutReceived > 0) {
            TOKEN_OUT.safeTransfer(payload.recipient, amountOutReceived);
        }
    }

    function _dockStrategy(bytes32 strategyHash, SwapPayloadCodec.SwapPayload memory payload) private {
        if (_strategyActive[strategyHash]) {
            AQUA.dock(address(this), strategyHash, payload.strategyTokens);
            _strategyActive[strategyHash] = false;
        }
    }

    function _validateStrategyArrays(SwapPayloadCodec.SwapPayload memory payload) private pure {
        bool tokenInFound;
        bool tokenOutFound;
        for (uint256 i = 0; i < payload.strategyTokens.length; ++i) {
            address token = payload.strategyTokens[i];
            if (token == payload.tokenIn) {
                tokenInFound = true;
            }
            if (token == payload.tokenOut) {
                tokenOutFound = true;
            }
        }
        if (!tokenInFound) revert MissingStrategyToken(payload.tokenIn);
        if (!tokenOutFound) revert MissingStrategyToken(payload.tokenOut);
    }

    function _ensureBalances(SwapPayloadCodec.SwapPayload memory payload) private view {
        bool satisfied;
        for (uint256 i = 0; i < payload.strategyTokens.length; ++i) {
            if (payload.strategyTokens[i] == payload.tokenIn) {
                if (payload.strategyBalances[i] < payload.amountLD) {
                    revert InsufficientBalance(payload.tokenIn, payload.amountLD, payload.strategyBalances[i]);
                }
                satisfied = true;
            }
        }
        if (!satisfied) revert MissingStrategyToken(payload.tokenIn);

        uint256 balance = TOKEN_IN.balanceOf(address(this));
        if (balance < payload.amountLD) {
            revert InsufficientBalance(payload.tokenIn, payload.amountLD, balance);
        }
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata) internal virtual override {
        revert("OAquaExecutor: no direct receive");
    }
}
