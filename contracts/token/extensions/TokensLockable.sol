// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AuthorizationGuard} from "../../management/roles/AuthorizationGuard.sol";
/**
 * @title TokensLockable
 * @author
 * @dev Contract for keeping additional accounting allowing to lock/unlock tokens for accounts
 */
abstract contract TokensLockable is Initializable {
    /// @dev Mapping of account to locked amount
    ///      Keeps track of the amount of tokens that are locked for the account
    mapping(address account => uint256 lockedAmount) private _lockedBalance;

    AuthorizationGuard private _authorizationGuard;

    /// @dev Emitted when the locked balance of the `account` changes
    /// @param account Account address
    /// @param lockedBalance New locked balance
    event LockedBalanceChanged(address indexed account, uint256 lockedBalance);

    modifier onlyAuthorized() {
        require(
            _authorizationGuard.hasRole(_authorizationGuard.AUTHORIZED_ROLE(), msg.sender),
            "Caller not authorized"
        );
        _;
    }

    /// @dev Initializes the contract
    function __TokensLockable_init(address authorizationGuardAddress) internal onlyInitializing {
        _authorizationGuard = AuthorizationGuard(authorizationGuardAddress);
    }

    /// @dev Returns the locked balance of the `account` for the token with `tokenId`
    /// @param account Account address
    /// @return Locked balance
    function lockedBalanceOf(address account) public view returns (uint256) {
        return _lockedBalance[account];
    }

    /// @dev Locks `amount` of the tokens for the `account`
    ///      Callable only by authorized accounts
    /// @param account Account address
    function lock(address account, uint256 amount) external onlyAuthorized {
        _addLockedBalance(account, amount);
    }

    /// @dev Unlocks `amount` of the tokens for the `account`
    ///      Callable only by authorized accounts
    /// @param account Account address
    function unlock(address account, uint256 amount) external onlyAuthorized {
        _subLockedBalance(account, amount);
    }

    /// @dev Adds `amount` of the tokens to the locked balance of the `account`
    /// @param account Account address
    /// @param amount Amount of the tokens to lock
    function _addLockedBalance(address account, uint256 amount) internal {
        uint256 newLockedBalance = _lockedBalance[account] + amount;

        // Should never reach the type(uint256).max value
        unchecked {
            _lockedBalance[account] = newLockedBalance;
        }

        emit LockedBalanceChanged(account, newLockedBalance);
    }

    /// @dev Subtracts `amount` of the tokens from the locked balance of the `account`
    /// @param account Account address
    /// @param amount Amount of the tokens to unlock
    function _subLockedBalance(address account, uint256 amount) internal {
        require(_lockedBalance[account] >= amount, "Insufficient locked balance");
        uint256 newLockedBalance = _lockedBalance[account] - amount;

        _lockedBalance[account] = newLockedBalance;

        emit LockedBalanceChanged(account, newLockedBalance);
    }
}
