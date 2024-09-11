// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.22;

import {
    ERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {TokensLockable} from "../token/extensions/TokensLockable.sol";
import {FeesManager} from "../management/FeesManager.sol";
import {AuthorizationGuardAccess} from "../management/roles/AuthorizationGuardAccess.sol";
import {AuthorizationGuard} from "../management/roles/AuthorizationGuard.sol";

/**
 * @title MetalToken
 * @author
 * @notice Contract representing the precious metal tokens. It is an ERC20 token with the ability to lock tokens,
 *         meaning that the locked tokens cannot be transferred until they are released. For this purpose, double
 *         accounting is used.
 */
contract MetalToken is Initializable, ERC20Upgradeable, TokensLockable, AuthorizationGuardAccess {
    FeesManager private _feesManager;

    /// @dev Insufficient balance to send
    /// @param account Account address
    /// @param balance Current balance of the account
    /// @param amount Amount of the tokens to send
    error InsufficientAvailableBalance(address account, uint256 balance, uint256 amount);

    // AuthorizationGuard private authorizationGuard;

    /// @param owner_ Owner address
    /// @param feesManager_ `FeesManager` contract address
    /// @param name_ Name of the token
    /// @param symbol_ Symbol of the token
    function initialize(
        address owner_,
        address feesManager_,
        string calldata name_,
        string calldata symbol_,
        address authorizationGuardAddress_
    ) public initializer {
        __AuthorizationGuardAccess_init(authorizationGuardAddress_);

        __TokensLockable_init(authorizationGuardAddress_);
        __ERC20_init(name_, symbol_);
        _feesManager = FeesManager(feesManager_);
    }

    /// @dev Mints a new tokens to `to` address and amount of `amount` and locks them
    ///      Callable only by authorized accounts
    /// @param to Receiver address
    /// @param amount Amount of the tokens to mint
    function mintAndLock(address to, uint256 amount) external onlyTokenManager {
        _addLockedBalance(to, amount);
        _mint(to, amount);
    }

    /// @dev Releases previously locked `amount` of tokens from `to` address
    ///      Callable only by authorized accounts
    /// @param to Token owner address
    /// @param amount Amount of the tokens to release
    function release(address to, uint256 amount) external onlyTokenManager {
        _subLockedBalance(to, amount);
    }

    /// @dev Burns `amount` tokens from `from` address
    ///      Callable only by authorized accounts
    /// @param from Token owner address
    /// @param amount Amount of the tokens to burn
    function burn(address from, uint256 amount) external onlyTokenManager {
        _burn(from, amount);
    }

    /// @dev Seizes `amount` of locked tokens from `from` address and transfers them to `to` address
    ///      Callable only by authorized accounts
    /// @param from Token owner address
    /// @param to Receiver address
    /// @param amount Amount of the tokens to seize
    function seizeLocked(address from, address to, uint256 amount) external onlyTokenManager {
        _subLockedBalance(from, amount);
        super._transfer(from, to, amount);
    }

    /// @dev @inheritdoc ERC20Upgradeable
    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        return transferFrom(msg.sender, to, amount);
    }

    /// @dev @inheritdoc ERC20Upgradeable
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public virtual override returns (bool) {
        uint256 balance = balanceOf(from);
        if (balance < amount) revert InsufficientAvailableBalance(from, balance, amount);

        (uint256 fee, uint256 remainingAmount) = _calculateFeeAndRemainingAmount(from, to, amount);

        super._transfer(from, _feesManager.feesWallet(), fee);
        super._transfer(from, to, remainingAmount);

        return true;
    }

    /// @dev @inheritdoc ERC20Upgradeable
    function balanceOf(address account) public view virtual override returns (uint256) {
        uint256 balance = super.balanceOf(account);
        uint256 lockedBalance = lockedBalanceOf(account);
        return lockedBalance >= balance ? 0 : balance - lockedBalance;
    }

    /// @dev Returns the `FeesManager` contract address
    /// @return `FeesManager` contract address
    function feesManager() external view returns (address) {
        return address(_feesManager);
    }

    /// @dev Returns the fee and remaining amount after fee calculation
    /// @param from Sender address
    /// @param to Receiver address
    /// @param remainingAmount Amount of the tokens to transfer
    function _calculateFeeAndRemainingAmount(
        address from,
        address to,
        uint256 amount
    ) public view returns (uint256 fee, uint256 remainingAmount) {
        fee = _feesManager.calculateTxFee(from, to, amount);
        remainingAmount = amount - fee;
    }
}
