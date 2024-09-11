// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {WhitelistTypes} from "lib/agau-common/admin-ops/WhitelistTypes.sol";
import {AuthorizationGuardAccess} from "../roles/AuthorizationGuardAccess.sol";

/**
 * @title TxFeeManager
 * @author
 * @dev Contract for managing transaction fees
 */
abstract contract TxFeeManager is Initializable, AuthorizationGuardAccess {
    /// @dev Transfer fee rate
    uint256 private _txFeeRate;
    /// @dev Minimum transfer fee
    uint256 private _minTxFee;
    /// @dev Maximum transfer fee
    uint256 private _maxTxFee;

    /// @dev Emitted when the transfer fee rate has changed
    /// @param newTxFeeRate New transfer fee rate
    event TxFeeRateSet(uint256 indexed newTxFeeRate);
    /// @dev Emitted when the minimum or maximum transfer fee has changed
    /// @param minTxFee New minimum transfer fee
    /// @param maxTxFee New maximum transfer fee
    event MinAndMaxTxFeeSet(uint256 indexed minTxFee, uint256 indexed maxTxFee);

    /// @dev Invalid transfer fee rate passed
    error InvalidTxFeeRate();
    /// @dev Invalid minimum or maximum transfer fee passed
    error InvalidMinOrMaxTxValue();

    /// @dev Initializes the contract
    /// @param txFeeRate_ Initial transfer fee rate
    /// @param minTxFee_ Minimum transfer fee
    /// @param maxTxFee_ Maximum transfer fee
    function __TxFeeManager_init(
        uint256 txFeeRate_,
        uint256 minTxFee_,
        uint256 maxTxFee_,
        address authorizationGuardAddress_
    ) internal onlyInitializing {
        _revertIfFeeRateInvalid(txFeeRate_);
        _revertIfInvalidMinOrMaxFee(minTxFee_, maxTxFee_);

        _setTxFeeRate(txFeeRate_);
        _setMinMaxTxFee(minTxFee_, maxTxFee_);

        __AuthorizationGuardAccess_init(authorizationGuardAddress_);
    }

    /// @dev Sets transfer fee rate
    ///      Callable only by authorized accounts
    ///      Emits a {TxFeeSet} event
    /// @param txFeeRate_ New transfer fee rate
    function setTxFeeRate(uint256 txFeeRate_) external onlyFeesManager {
        _revertIfFeeRateInvalid(txFeeRate_);
        _setTxFeeRate(txFeeRate_);
    }

    /// @dev Sets minimum and maximum transaction fee
    ///      Callable only by authorized accounts
    /// @param minTxFee_ New minimum transaction fee
    /// @param maxTxFee_ New maximum transaction fee
    function setMinAndMaxTxFee(uint256 minTxFee_, uint256 maxTxFee_) external onlyFeesManager {
        _revertIfInvalidMinOrMaxFee(minTxFee_, maxTxFee_);
        _setMinMaxTxFee(minTxFee_, maxTxFee_);
    }

    /// @dev Returns the transaction fee for the given amount
    /// @param amount Amount of the transaction
    /// @return Transaction fee
    function calculateTxFee(uint256 amount) public view returns (uint256) {
        return (amount * _txFeeRate) / WhitelistTypes.TX_FEE_DENOMINATOR;
    }

    /// @dev Returns the transaction fee rate
    /// @return Transaction fee rate
    function txFeeRate() public view returns (uint256) {
        return _txFeeRate;
    }

    /// @dev Returns the minimum transaction fee
    /// @return Minimum transaction fee
    function minTxFee() public view returns (uint256) {
        return _minTxFee;
    }

    /// @dev Returns the maximum transaction fee
    /// @return Maximum transaction fee
    function maxTxFee() public view returns (uint256) {
        return _maxTxFee;
    }

    /// @dev Reverts if the fee rate is invalid
    /// @param txFeeRate_ Fee rate to check
    function _revertIfFeeRateInvalid(uint256 txFeeRate_) private pure {
        if (txFeeRate_ > WhitelistTypes.TX_FEE_DENOMINATOR) revert InvalidTxFeeRate();
    }

    /// @dev Reverts if the minimum or maximum fee is invalid
    /// @param minTxFee_ Minimum fee to check
    /// @param maxTxFee_ Maximum fee to check
    function _revertIfInvalidMinOrMaxFee(uint256 minTxFee_, uint256 maxTxFee_) private pure {
        if (minTxFee_ > maxTxFee_) revert InvalidMinOrMaxTxValue();
    }

    /// @dev Sets minimum and maximum transaction fee
    ///      Emits a {MinAndMaxTxFeeSet} event
    /// @param minTxFee_ New minimum transaction fee
    /// @param maxTxFee_ New maximum transaction fee
    function _setMinMaxTxFee(uint256 minTxFee_, uint256 maxTxFee_) private {
        _minTxFee = minTxFee_;
        _maxTxFee = maxTxFee_;

        emit MinAndMaxTxFeeSet(minTxFee_, maxTxFee_);
    }

    /// @dev Sets transfer fee rate
    ///      Emits a {TxFeeSet} event
    /// @param txFeeRate_ New transfer fee rate
    function _setTxFeeRate(uint256 txFeeRate_) private {
        _txFeeRate = txFeeRate_;

        emit TxFeeRateSet(txFeeRate_);
    }

    uint256[47] private __gap;
}
