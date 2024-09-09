// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.22;

import {WhitelistTypes} from "lib/agau-common/admin-ops/WhitelistTypes.sol";

/**
 * @title TokenOpTypes
 * @author
 * @dev Library with types used by the contracts for Token interaction
 */
library TokenOpTypes {
    enum OpType {
        MINT_OP,
        RELEASE_OP,
        ADMIN_OP
    }

    struct CommonAdminOpManageSignerData {
        address signerAddress;
        string roleName;
        OpType operationType;
    }

    struct CommonAdminOpManageSigner {
        CommonAdminOpManageSignerData signData;
        // Message Hash
        bytes32 signatureHash;
        // Submitted signatures
        bytes[] signatures;
    }

    /// @dev Structure containing common token management instruction
    struct CommonTokenOp {
        // Account address to receive token
        address account;
        // Total amount of the metal (in grams)
        uint48 weight;
        // Metal identifier
        uint8 metalId;
    }
    struct CommonTokenOpWithSignature {
        // Account address to receive token
        address account;
        // Total amount of the metal (in grams)
        uint48 weight;
        // Metal identifier
        uint8 metalId;
        string documentHash;
        // Message Hash
        bytes32 signatureHash;
        // Submitted signatures
        bytes[] signatures;
    }

    struct CommonTokenOpSignatureData {
        // Account address to receive token
        address account;
        // Total amount of the metal (in grams)
        uint48 weight;
        // Metal identifier
        uint8 metalId;
        // Hash of the document to sign
        string documentHash;
    }

    /// @dev Structure containing token burn instruction
    struct BurnTokenOp {
        // Total amount of the metal (in grams)
        uint48 weight;
        // Metal identifier
        uint8 metalId;
    }

    /// @dev Structure containing token management instruction
    struct TokenManagementOp {
        // Account address message is referred to
        address user;
        // Amount of tokens
        uint256 amount;
        // Metal identifier
        uint8 metalId;
    }

    /// @dev Structure containing token seize instruction
    struct TokenTransferOp {
        // Account address whose tokens will be seized
        address from;
        // Address to which seized tokens will be moved
        address to;
        // Amount of tokens transferred
        uint256 amount;
        // Metal identifier
        uint8 metalId;
    }

    /// @dev Structure containing create fee discount group instruction
    struct CreateFeeDiscountGroupOp {
        // Discount group type
        WhitelistTypes.GroupType groupType;
        // Discount group configuration
        WhitelistTypes.Discount discount;
    }

    /// @dev Structure containing update fee discount group instruction
    struct UpdateFeeDiscountGroupOp {
        // Discount group type
        WhitelistTypes.GroupType groupType;
        // Discount group configuration
        WhitelistTypes.Discount discount;
        // Discount group id
        uint256 groupId;
    }

    /// @dev Structure containing assign group to a user instruction
    struct UserDiscountGroupOp {
        // Discount group type
        WhitelistTypes.GroupType groupType;
        // Discount group id
        uint256 groupId;
        // User address
        address user;
    }

    /// @dev Structure containing transaction fee rate
    struct TransactionFeeRateOp {
        // Transaction fee rate
        uint256 feeRate;
    }

    /// @dev Structure containing fee amount range
    struct FeeAmountRangeOp {
        // Minimum amount of the fee
        uint256 minimumAmount;
        // Maximum amount of the fee
        uint256 maximumAmount;
    }
}
