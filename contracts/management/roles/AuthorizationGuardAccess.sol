// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.22;
import "hardhat/console.sol";

import {AuthorizationGuard} from "./AuthorizationGuard.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

abstract contract AuthorizationGuardAccess is Initializable {
    AuthorizationGuard private _authorizationGuard;

    event LogAddress(string name, address logAddress);

    modifier onlyAdminAccess() {
        require(
            _authorizationGuard.hasRole(_authorizationGuard.DEFAULT_ADMIN_ROLE(), msg.sender),
            "Missing `DEFAULT_ADMIN_ROLE`"
        );
        _;
    }

    modifier onlyFeesManager() {
        require(
            _authorizationGuard.hasRole(_authorizationGuard.FEES_MANAGER_ROLE(), msg.sender),
            "Missing `FEES_MANAGER_ROLE`"
        );
        _;
    }

    modifier onlyAuthorizedAccess() {
        require(
            _authorizationGuard.hasRole(_authorizationGuard.AUTHORIZED_ROLE(), msg.sender),
            "Missing `AUTHORIZED_ROLE`"
        );
        _;
    }

    modifier onlyTokenManager() {
        require(
            _authorizationGuard.hasRole(_authorizationGuard.TOKEN_MANAGER_ROLE(), msg.sender),
            "Missing `TOKEN_MANAGER_ROLE`"
        );
        _;
    }

    function __AuthorizationGuardAccess_init(
        address authorizationGuardAddress
    ) internal initializer {
        _authorizationGuard = AuthorizationGuard(authorizationGuardAddress);
    }

    function authorizationGuard() public view returns (AuthorizationGuard) {
        return _authorizationGuard;
    }
}
