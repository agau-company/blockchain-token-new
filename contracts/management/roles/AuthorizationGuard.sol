// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/AccessControl.sol";
import {TokenOpTypes} from "lib/agau-types/TokenOpTypes.sol";

/**
 * Deploy AuthorizationGuard first. Pass to the constructor the administrator addresses
 * and the authorized addresses. The admin addresses are able to make call general functions
 * such as granting roles, revoking roles, etc..
 * The authorized addresses are able to call functions outside this contract which require
 * authority such as minting new tokens, burning, setting fees, etc..
 */
contract AuthorizationGuard is AccessControl {
    // Can call authorized functions in `TokenManager`
    bytes32 public constant AUTHORIZED_ROLE = keccak256("AUTHORIZED_ROLE");

    // Can call functions in `FeesManager` contract
    bytes32 public constant FEES_MANAGER_ROLE = keccak256("FEES_MANAGER_ROLE");

    // Can call functions in `TokenManager` contract
    bytes32 public constant TOKEN_MANAGER_ROLE = keccak256("TOKEN_MANAGER_ROLE");

    bytes32 public constant MINT_SIGNER_ROLE = keccak256("MINT_SIGNER_ROLE");
    bytes32 public constant RELEASE_SIGNER_ROLE = keccak256("RELEASE_SIGNER_ROLE");
    bytes32 public constant SIGNATURE_MANAGER_ROLE = keccak256("SIGNATURE_MANAGER_ROLE");
    bytes32 public constant SIGN_ROLES_MANAGER_ROLE = keccak256("SIGN_ROLES_MANAGER_ROLE");

    event LogAddress(string name, address logAddress);

    mapping(address => bool) private trustedContracts_;

    address private _multiSignValidationAddress;

    error InvalidOperationType();

    constructor(
        address[] memory admins,
        address[] memory authorizedAccounts,
        address[] memory trustedContractAddresses
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        /// Assign admin roles to admin accounts
        for (uint256 i = 0; i < admins.length; i++) {
            _grantRole(DEFAULT_ADMIN_ROLE, admins[i]);
        }

        /// Assign authorized roles to authorized accounts
        for (uint256 i = 0; i < authorizedAccounts.length; i++) {
            _grantRole(AUTHORIZED_ROLE, authorizedAccounts[i]);
        }

        bool[] memory isTrusted = new bool[](trustedContractAddresses.length);
        for (uint256 i = 0; i < trustedContractAddresses.length; i++) {
            isTrusted[i] = true;
        }

        setTokenManagerRole(trustedContractAddresses, isTrusted);
    }

    modifier onlyAdminAccess() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Missing `DEFAULT_ADMIN_ROLE`");
        _;
    }

    modifier onlyAuthorizedAccess() {
        require(hasRole(AUTHORIZED_ROLE, msg.sender), "Missing `AUTHORIZED_ROLE`");
        _;
    }

    modifier onlySignerRolesManager() {
        require(hasRole(SIGN_ROLES_MANAGER_ROLE, msg.sender), "Missing `SIGN_ROLES_MANAGER_ROLE`");
        _;
    }

    function setTokenManagerRole(
        address[] memory addresses,
        bool[] memory isTrusted
    ) public onlyAdminAccess {
        require(addresses.length == isTrusted.length, "Addresses and switch arrays mismatch");
        for (uint8 i = 0; i < addresses.length; i++) {
            if (isTrusted[i]) {
                grantRole(TOKEN_MANAGER_ROLE, addresses[i]);
            } else {
                revokeRole(TOKEN_MANAGER_ROLE, addresses[i]);
            }
        }
    }

    function isTrustedContract(address targetAddress) external view returns (bool) {
        return trustedContracts_[targetAddress];
    }
    function setAuthorized(address account, bool status) external onlyAdminAccess {
        if (status) {
            grantRole(AUTHORIZED_ROLE, account);
        } else {
            revokeRole(AUTHORIZED_ROLE, account);
        }
    }

    function setAuthorizedBatch(address[] memory accounts, bool status) external onlyAdminAccess {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (status) {
                grantRole(AUTHORIZED_ROLE, accounts[i]);
            } else {
                revokeRole(AUTHORIZED_ROLE, accounts[i]);
            }
        }
    }

    function setSignerRole(
        address signer,
        TokenOpTypes.OpType operationType,
        bool canSign,
        address originalSigner
    ) external onlySignerRolesManager returns (bool) {
        require(hasRole(AUTHORIZED_ROLE, originalSigner), "Missing `AUTHORIZED_ROLE`");
        if (canSign) {
            if (operationType == TokenOpTypes.OpType.MINT_OP) {
                _grantRole(MINT_SIGNER_ROLE, signer);
            } else if (operationType == TokenOpTypes.OpType.RELEASE_OP) {
                _grantRole(RELEASE_SIGNER_ROLE, signer);
            } else if (operationType == TokenOpTypes.OpType.SIGN_MANAGER_OP) {
                _grantRole(SIGNATURE_MANAGER_ROLE, signer);
            } else {
                revert InvalidOperationType();
            }
        } else {
            if (operationType == TokenOpTypes.OpType.MINT_OP) {
                _revokeRole(MINT_SIGNER_ROLE, signer);
            } else if (operationType == TokenOpTypes.OpType.RELEASE_OP) {
                _revokeRole(RELEASE_SIGNER_ROLE, signer);
            } else if (operationType == TokenOpTypes.OpType.SIGN_MANAGER_OP) {
                _revokeRole(SIGNATURE_MANAGER_ROLE, signer);
            } else {
                revert InvalidOperationType();
            }
        }

        return true;
    }
}
