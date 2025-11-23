// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IReceiverTemplate
 * @notice Template contract for CRE consumer contracts
 */
abstract contract IReceiverTemplate {
    /**
     * @notice Called by the Forwarder with the report data
     * @param report The encoded report data
     */
    function onReport(bytes calldata report) external {
        _processReport(report);
    }

    /**
     * @notice Internal function to be implemented by derived contracts
     * @param report The encoded report data
     */
    function _processReport(bytes calldata report) internal virtual;
}

