// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.22;

import {WhitelistTypes} from "lib/agau-common/admin-ops/WhitelistTypes.sol";
import {AuthorizationGuardAccess} from "../roles/AuthorizationGuardAccess.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title FeesWhitelist
 * @author
 * @dev Contract for managing fee discounts and their assignment to users
 */
abstract contract FeesWhitelist is Initializable, AuthorizationGuardAccess {
    /// @dev Identifier of the special AgAu group created during intialization. Has 100% discount
    uint256 public constant SPECIAL_AGAU_GROUP_ID = 1;

    /// @dev Mapping from group type to group count
    mapping(WhitelistTypes.GroupType groupType => uint256 count) private _groupCount;
    /// @dev Mapping from group type to mapping from group Identifier to discount data
    mapping(WhitelistTypes.GroupType groupType => mapping(uint256 groupId => WhitelistTypes.Discount discount))
        private _feeDiscounts;
    /// @dev Mapping from group type to mapping from user to group Identifier
    mapping(WhitelistTypes.GroupType groupType => mapping(address user => uint256 groupId))
        private _userToGroup;

    /// @dev Emitted when a new discount group is created
    /// @param groupType Type of the group
    /// @param groupId Identifier of the group
    /// @param discount Discount data
    event DiscountGroupCreated(
        WhitelistTypes.GroupType indexed groupType,
        uint256 indexed groupId,
        WhitelistTypes.Discount discount
    );

    /// @dev Emitted when a discount group is updated
    /// @param groupType Type of the group
    /// @param groupId Identifier of the group
    /// @param discount Discount data
    event DiscountGroupUpdated(
        WhitelistTypes.GroupType indexed groupType,
        uint256 indexed groupId,
        WhitelistTypes.Discount discount
    );

    /// @dev Emitted when a user is set to a group
    /// @param groupType Type of the group
    /// @param user User address
    /// @param groupId Identifier of the group
    event UserToFeeGroupSet(
        WhitelistTypes.GroupType indexed groupType,
        address indexed user,
        uint256 indexed groupId
    );

    /// @dev Discount group does not exist
    error DiscountGroupNotExist();
    /// @dev Cannot change default group
    error CannotChangeDefaultGroup();
    /// @dev Group type is invalid
    error InvalidGroupType();
    /// @dev Discount type is invalid
    error InvalidDiscountType();
    /// @dev Discount value is invalid
    error InvalidDiscountValue();

    function __FeesWhitelist_init(
        address[] memory zeroFeesAccounts,
        address authorizationGuardAddress
    ) internal onlyInitializing {
        // Create a special group for AgAu wallets which should not have any fees
        _createDiscountGroup(
            WhitelistTypes.GroupType.TxFee,
            WhitelistTypes.Discount({
                discountType: WhitelistTypes.DiscountType.PercentDiscount,
                value: uint248(WhitelistTypes.DISCOUNT_RATE_DENOMINATOR)
            })
        );

        __AuthorizationGuardAccess_init(authorizationGuardAddress);

        // Set zero fees accounts
        for (uint256 i; i < zeroFeesAccounts.length; ++i) {
            _setGroupForUser(
                WhitelistTypes.GroupType.TxFee,
                SPECIAL_AGAU_GROUP_ID,
                zeroFeesAccounts[i]
            );
        }
    }

    /// @dev Creates a new discount group
    ///      Callable only by authorized accounts
    /// @param groupType Type of the group
    /// @param discount_ Discount data
    function createDiscountGroup(
        WhitelistTypes.GroupType groupType,
        WhitelistTypes.Discount calldata discount_
    ) external onlyFeesManager {
        _revertIfInvalidDiscount(discount_);
        _createDiscountGroup(groupType, discount_);
    }

    /// @dev Updates a discount group. Can be used to set a discount group to 0, effectively removing it
    ///      Callable only by authorized accounts
    ///      Emits `DiscountGroupUpdated` event
    /// @param groupType Type of the group
    /// @param groupId Identifier of the group
    /// @param discount_ New discount data
    function updateDiscountGroup(
        WhitelistTypes.GroupType groupType,
        uint256 groupId,
        WhitelistTypes.Discount calldata discount_
    ) external onlyFeesManager {
        _revertIfGroupNotExist(groupType, groupId);
        _revertIfDefaultGroup(groupId);
        _revertIfInvalidDiscount(discount_);

        _feeDiscounts[groupType][groupId] = discount_;

        emit DiscountGroupUpdated(groupType, groupId, discount_);
    }

    /// @dev Sets a user to a group with `groupId` of a specific `groupType`
    ///      Can be used to remove a user from a group by setting `groupId` to 0
    ///      Callable only by authorized accounts
    /// @param groupType Type of the group
    /// @param groupId Identifier of the group
    /// @param user User address
    function setGroupForUser(
        WhitelistTypes.GroupType groupType,
        uint256 groupId,
        address user
    ) external onlyFeesManager {
        _revertIfGroupNotExist(groupType, groupId);
        _setGroupForUser(groupType, groupId, user);
    }

    /// @dev Returns the discount data for a group
    /// @param groupType Type of the group
    /// @param groupId Identifier of the group
    /// @return Discount data
    function discount(
        WhitelistTypes.GroupType groupType,
        uint256 groupId
    ) public view returns (WhitelistTypes.Discount memory) {
        return _feeDiscounts[groupType][groupId];
    }

    /// @dev Returns the count of the discount groups for `groupType`
    /// @param groupType Type of the group
    function discountGroupCount(
        WhitelistTypes.GroupType groupType
    ) external view returns (uint256) {
        return _groupCount[groupType];
    }

    /// @dev Returns the discount group for a user
    /// @param groupType Type of the group
    /// @param user User address
    function discountGroupIdForUser(
        WhitelistTypes.GroupType groupType,
        address user
    ) public view returns (uint256) {
        return _userToGroup[groupType][user];
    }

    /// @dev Returns the discount data for a user
    /// @param groupType Type of the group
    /// @param user User address
    /// @return Discount data
    function discountForUser(
        WhitelistTypes.GroupType groupType,
        address user
    ) public view returns (WhitelistTypes.Discount memory) {
        uint256 groupId = discountGroupIdForUser(groupType, user);
        return _feeDiscounts[groupType][groupId];
    }

    /// @dev Returns the discount data for a transaction participants.
    ///      In case any of the participants is in special group, use special group discount.
    ///      Otherwise, use the discount group of the sender
    /// @param groupType Type of the group
    /// @param sender Sender address
    /// @param receiver Receiver address
    /// @return discount_ Discount data
    /// @return denominator Denominator for the discount value
    function discountForTxParticipants(
        WhitelistTypes.GroupType groupType,
        address sender,
        address receiver
    ) public view returns (WhitelistTypes.Discount memory discount_, uint256 denominator) {
        uint256 senderGroupId = discountGroupIdForUser(groupType, sender);
        uint256 receiverGroupId = discountGroupIdForUser(groupType, receiver);

        // In case any of tx participants is in special group, use special group discount
        if (senderGroupId == SPECIAL_AGAU_GROUP_ID || receiverGroupId == SPECIAL_AGAU_GROUP_ID) {
            discount_ = discount(groupType, SPECIAL_AGAU_GROUP_ID);
        }
        // else use the discount group of the sender
        else {
            discount_ = discount(groupType, senderGroupId);
        }

        return (discount_, WhitelistTypes.DISCOUNT_RATE_DENOMINATOR);
    }

    /// @dev Reverts if group does not exist
    /// @param groupType Type of the group
    function _revertIfGroupNotExist(
        WhitelistTypes.GroupType groupType,
        uint256 groupId
    ) private view {
        if (groupId > _groupCount[groupType]) revert DiscountGroupNotExist();
    }

    /// @dev Reverts if group is default group
    /// @param groupId Identifier of the group
    function _revertIfDefaultGroup(uint256 groupId) private pure {
        if (groupId == 0) revert CannotChangeDefaultGroup();
    }

    /// @dev Reverts if discount is invalid
    /// @param discount_ Discount data
    function _revertIfInvalidDiscount(WhitelistTypes.Discount calldata discount_) private pure {
        if (discount_.discountType == WhitelistTypes.DiscountType.None)
            revert InvalidDiscountType();
        if (discount_.value > WhitelistTypes.DISCOUNT_RATE_DENOMINATOR)
            revert InvalidDiscountValue();
    }

    /// @dev Creates a new discount group
    ///      Emits `DiscountGroupCreated` event
    /// @param groupType Type of the group
    /// @param discount_ Discount data
    function _createDiscountGroup(
        WhitelistTypes.GroupType groupType,
        WhitelistTypes.Discount memory discount_
    ) private {
        if (groupType == WhitelistTypes.GroupType.None) revert InvalidGroupType();

        uint256 groupId = ++_groupCount[groupType];
        _feeDiscounts[groupType][groupId] = discount_;

        emit DiscountGroupCreated(groupType, groupId, discount_);
    }

    /// @dev Sets a user to a group with `groupId` of a specific `groupType`
    ///      Can be used to remove a user from a group by setting `groupId` to 0
    ///      Emits `UserToFeeGroupSet` event
    /// @param groupType Type of the group
    /// @param groupId Identifier of the group
    /// @param user User address
    function _setGroupForUser(
        WhitelistTypes.GroupType groupType,
        uint256 groupId,
        address user
    ) private {
        _userToGroup[groupType][user] = groupId;

        emit UserToFeeGroupSet(groupType, user, groupId);
    }

    uint256[47] private __gap;
}
