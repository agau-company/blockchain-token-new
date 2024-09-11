// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AuthorizationGuardAccess} from "./roles/AuthorizationGuardAccess.sol";

import {FeesWhitelist} from "contracts/management/fees/FeesWhitelist.sol";
import {TxFeeManager} from "contracts/management/fees/TxFeeManager.sol";
import {WhitelistTypes} from "lib/agau-common/admin-ops/WhitelistTypes.sol";

/**
 * @title FeesManager
 * @author
 * @dev Contract for managing fees calculation
 */
contract FeesManager is Initializable, AuthorizationGuardAccess, FeesWhitelist, TxFeeManager {
    /// @dev Fees wallet address
    address private _feesWallet;

    /// @dev Emitted when the address of the fees wallet has changed
    /// @param newFeesWallet New address of the fees wallet
    event FeesWalletSet(address indexed newFeesWallet);

    /// @dev Invalid new fees wallet address passed
    error InvalidNewFeesWallet();

    /// @dev Initializes the contract
    /// @param feesWallet_ Fees wallet address
    /// @param txFeeRate_ Rate of the transaction fee
    /// @param minTxFee_ Minimum transaction fee
    /// @param maxTxFee_ Maximum transaction fee
    /// @param zeroFeeAccounts_ Addresses of the accounts with zero fees
    function initialize(
        address feesWallet_,
        uint256 txFeeRate_,
        uint256 minTxFee_,
        uint256 maxTxFee_,
        address[] calldata zeroFeeAccounts_,
        address authorizationGuardAddress_
    ) external initializer {
        __AuthorizationGuardAccess_init(authorizationGuardAddress_);
        __FeesWhitelist_init(zeroFeeAccounts_, authorizationGuardAddress_);
        __TxFeeManager_init(txFeeRate_, minTxFee_, maxTxFee_, authorizationGuardAddress_);

        _setFeesWallet(feesWallet_);
    }

    /// @dev Sets the address of the fees wallet
    ///      Callable only by authorized accounts
    ///      Emits a {FeeWalletSet} event
    /// @param newFeeWallet New address of the fees wallet
    function setFeesWallet(address newFeeWallet) external onlyFeesManager {
        _setFeesWallet(newFeeWallet);
    }

    /// @dev Calculates the fee for a transfer of `amount` tokens
    /// @param from Sender address
    /// @param to Receiver address
    function calculateTxFee(
        address from,
        address to,
        uint256 amount
    ) public view returns (uint256 fee) {
        (WhitelistTypes.Discount memory discount_, uint256 denominator) = discountForTxParticipants(
            WhitelistTypes.GroupType.TxFee,
            from,
            to
        );

        // If Discount type `FlatPercentFee`, ignore txFeeRate_ and use discount_.value
        if (discount_.discountType == WhitelistTypes.DiscountType.FlatPercentFee) {
            fee = (amount * discount_.value) / denominator;
        } else {
            fee = calculateTxFee(amount);
            // Else if discount type `PercentDiscount, apply discount_.value as a discount on calculated fee
            // while using `txFeeRate_` as the base
            if (discount_.discountType == WhitelistTypes.DiscountType.PercentDiscount) {
                fee -= (fee * discount_.value) / denominator;
            }
        }

        uint256 minTxFee_ = minTxFee();
        uint256 maxTxFee_ = maxTxFee();

        // Check if fee is within bounds
        if (fee < minTxFee_) fee = minTxFee_;
        else if (fee > maxTxFee_) fee = maxTxFee_;
    }

    /// @dev Returns the address of the fees wallet
    /// @return Fees wallet address
    function feesWallet() external view returns (address) {
        return _feesWallet;
    }

    /// @dev Sets the address of the fees wallet
    ///      Emits a {FeeWalletSet} event
    /// @param newFeesWallet New address of the fees  wallet
    function _setFeesWallet(address newFeesWallet) private {
        if (newFeesWallet == address(0)) revert InvalidNewFeesWallet();
        _feesWallet = newFeesWallet;

        emit FeesWalletSet(newFeesWallet);
    }
}
