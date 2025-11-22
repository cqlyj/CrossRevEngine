// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MessagingFee, MessagingReceipt } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SendParam, OFTReceipt, OFTFeeDetail, OFTLimit } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";

import { IAquaSwapVMRouter } from "../../contracts/interfaces/IAquaSwapVMRouter.sol";

contract ERC20Mintable is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract StargateMock {
    MessagingFee public quoteFee;
    SendParam public lastSendParam;
    MessagingFee public lastFee;
    address public lastRefundAddress;
    MessagingReceipt public lastReceipt;
    OFTReceipt public lastOFTReceipt;
    OFTLimit public mockLimit;
    uint256 public mockAmountReceivedLD;
    bool public quoteOFTConfigured;

    function setQuote(uint256 nativeFee, uint256 lzFee) external {
        quoteFee = MessagingFee(nativeFee, lzFee);
    }

    function setQuoteOFT(uint256 minAmountLD, uint256 maxAmountLD, uint256 amountReceivedLD) external {
        mockLimit = OFTLimit(minAmountLD, maxAmountLD);
        mockAmountReceivedLD = amountReceivedLD;
        quoteOFTConfigured = true;
    }

    function resetQuoteOFT() external {
        delete mockLimit;
        delete mockAmountReceivedLD;
        quoteOFTConfigured = false;
    }

    function quoteSend(SendParam calldata, bool) external view returns (MessagingFee memory) {
        return quoteFee;
    }

    function quoteOFT(
        SendParam calldata _sendParam
    ) external view returns (OFTLimit memory limit, OFTFeeDetail[] memory feeDetails, OFTReceipt memory receipt) {
        limit = quoteOFTConfigured ? mockLimit : OFTLimit({ minAmountLD: 1, maxAmountLD: type(uint256).max });

        uint256 amountReceived = quoteOFTConfigured ? mockAmountReceivedLD : _sendParam.amountLD;

        receipt = OFTReceipt({ amountSentLD: _sendParam.amountLD, amountReceivedLD: amountReceived });
        feeDetails = new OFTFeeDetail[](0);
    }

    function send(
        SendParam calldata _sendParam,
        MessagingFee calldata _fee,
        address _refundAddress
    ) external payable returns (MessagingReceipt memory receipt, OFTReceipt memory oftReceipt) {
        lastSendParam = _sendParam;
        lastFee = _fee;
        lastRefundAddress = _refundAddress;

        receipt = MessagingReceipt({
            guid: keccak256(abi.encode(block.timestamp, _sendParam.amountLD)),
            nonce: 0,
            fee: _fee
        });
        oftReceipt = OFTReceipt({ amountSentLD: _sendParam.amountLD, amountReceivedLD: _sendParam.amountLD });

        lastReceipt = receipt;
        lastOFTReceipt = oftReceipt;
    }
}

contract AquaMock {
    bytes32 public lastStrategyHash;
    address public lastShipApp;
    bytes public lastStrategyData;
    address[] public lastShipTokens;
    uint256[] public lastShipBalances;

    address public lastDockApp;
    bytes32 public lastDockHash;
    address[] public lastDockTokens;

    function ship(
        address app,
        bytes calldata strategy,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external returns (bytes32 strategyHash) {
        lastShipApp = app;
        lastStrategyData = strategy;
        lastShipTokens = tokens;
        lastShipBalances = amounts;
        strategyHash = keccak256(abi.encode(app, strategy, tokens, amounts));
        lastStrategyHash = strategyHash;
    }

    function dock(address app, bytes32 strategyHash, address[] calldata tokens) external {
        lastDockApp = app;
        lastDockHash = strategyHash;
        lastDockTokens = tokens;
    }
}

contract AquaSwapVMRouterMock is IAquaSwapVMRouter {
    Order public lastOrder;
    address public lastCaller;
    address public lastTokenIn;
    address public lastTokenOut;
    uint256 public lastAmountIn;
    bytes public lastTakerTraits;

    uint256 public nextAmountIn;
    uint256 public nextAmountOut;
    bytes32 public nextOrderHash;

    bool public shouldRevert;
    bytes public revertData;

    IERC20 public tokenOutAsset;

    function setTokenOutAsset(address token) external {
        tokenOutAsset = IERC20(token);
    }

    function setSwapOutcome(uint256 amountInUsed, uint256 amountOut, bytes32 orderHash) external {
        nextAmountIn = amountInUsed;
        nextAmountOut = amountOut;
        nextOrderHash = orderHash;
    }

    function setRevert(bytes calldata data) external {
        shouldRevert = data.length > 0;
        revertData = data;
    }

    function swap(
        Order calldata order,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        bytes calldata takerTraitsAndData
    ) external returns (uint256 amountInUsed, uint256 amountOut, bytes32 orderHash) {
        if (shouldRevert) {
            bytes memory reason = revertData.length == 0 ? abi.encodeWithSignature("MockSwapFailed()") : revertData;
            assembly {
                revert(add(reason, 32), mload(reason))
            }
        }

        lastCaller = msg.sender;
        lastOrder = order;
        lastTokenIn = tokenIn;
        lastTokenOut = tokenOut;
        lastAmountIn = amount;
        lastTakerTraits = takerTraitsAndData;

        if (address(tokenOutAsset) != address(0) && nextAmountOut > 0) {
            tokenOutAsset.transfer(msg.sender, nextAmountOut);
        }

        return (nextAmountIn, nextAmountOut, nextOrderHash);
    }

    // Unused interface functions
    function AQUA() external pure returns (address) {
        return address(0);
    }

    function hash(Order calldata) external pure returns (bytes32) {
        return bytes32(0);
    }

    function quote(
        Order calldata,
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (uint256, uint256, bytes32) {
        return (0, 0, bytes32(0));
    }
}
