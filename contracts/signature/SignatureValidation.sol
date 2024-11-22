// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AuthorizationGuard} from "../management/roles/AuthorizationGuard.sol";
import {AuthorizationGuardAccess} from "../management/roles/AuthorizationGuardAccess.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {TokenOpTypes} from "lib/agau-types/TokenOpTypes.sol";
/**
 * @title MultiSigValidation
 * @dev MultiSigValidation is a contract for managing multi-signature validation,
 * signers, and roles for different operation types.
 * Inherits from AuthorizationGuardAccess to leverage role-based access control.
 */
contract MultiSigValidation is AuthorizationGuardAccess {
    using ECDSA for bytes32;

    struct Role {
        string name;
        address signerAddress;
    }

    struct SignerEntity {
        address signerAddress;
        string roleName;
        TokenOpTypes.OpType operationType;
    }

    bool public isInitialized = false;

    AuthorizationGuard public _authorizationGuard;

    uint8 public constant MAX_SIGNERS = 15;
    uint8 public constant MIN_REQUIRED_SIGNATURES = 1;

    mapping(TokenOpTypes.OpType => uint256) public requiredSignatures;
    mapping(TokenOpTypes.OpType => mapping(address => string)) public roles;

    mapping(TokenOpTypes.OpType => mapping(uint256 => address)) public unsortedSignersRegistry;

    mapping(TokenOpTypes.OpType => mapping(bytes32 => mapping(address => bool))) public signatures;
    mapping(bytes32 => uint256) public signatureCount;
    mapping(bytes32 => bool) public usedHashes;

    event SignatureValidated(
        address operator,
        TokenOpTypes.OpType operationType,
        bytes32 operationMessageHash,
        bytes[] signatures
    );
    event SignatureReceived(address signer, bytes32 hash, string roleName);
    event SignerAdded(string roleName, address signerAddress, TokenOpTypes.OpType operationType);
    event SignerRemoved(string roleName, address signerAddress, TokenOpTypes.OpType operationType);
    event SignerUpdated(
        string roleName,
        address newSigner,
        address previousSigner,
        TokenOpTypes.OpType operationType
    );

    /**
     * @dev Initializes the contract by setting the authorization guard address.
     * @param _authorizationGuardAddress Address of the authorization guard.
     */
    constructor(address _authorizationGuardAddress) {
        __AuthorizationGuardAccess_init(_authorizationGuardAddress);
        _authorizationGuard = AuthorizationGuard(_authorizationGuardAddress);
    }

    function initialize(
        SignerEntity[] memory _multiSigSigners,
        SignerEntity[] memory _mintSigners,
        SignerEntity[] memory _releaseSigners
    ) external {
        require(!isInitialized, "Already initialized");
        require(
            _mintSigners.length > 0 &&
                _mintSigners.length <= MAX_SIGNERS &&
                _releaseSigners.length > 0 &&
                _releaseSigners.length <= MAX_SIGNERS &&
                _multiSigSigners.length > 0 &&
                _multiSigSigners.length <= MAX_SIGNERS,
            "Invalid number of signers"
        );

        for (uint8 i = 0; i < _mintSigners.length; i++) {
            _addSigner(_mintSigners[i]);
        }
        for (uint8 i = 0; i < _releaseSigners.length; i++) {
            _addSigner(_releaseSigners[i]);
        }
        for (uint8 i = 0; i < _multiSigSigners.length; i++) {
            _addSigner(_multiSigSigners[i]);
        }

        isInitialized = true;
    }

    /**
     * @dev Generates a hash of the common operation message.
     * @param functionName Name of the function to be included in the hash.
     * @param message Struct containing common token operation signature data.
     * @return Hash of the common operation message.
     */
    function getMessageHashCommon(
        string memory functionName,
        TokenOpTypes.CommonTokenOpSignatureData memory message
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    functionName,
                    message.account,
                    message.weight,
                    message.metalId,
                    message.documentHash
                )
            );
    }

    /**
     * @notice Overloaded function for `CommonAdminOpAddSignerData` message types
     * @dev Generates a hash of the common operation message.
     * @param functionName Name of the function to be included in the hash.
     * @param message Struct containing common token operation signature data.
     * @return Hash of the common operation message.
     */
    function getMessageHashCommon(
        string memory functionName,
        TokenOpTypes.CommonAdminOpManageSignerData memory message
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    functionName,
                    message.signerAddress,
                    message.roleName,
                    message.operationType
                )
            );
    }

    // CHANGED: Removed the onlyTokenManager modifier
    /**
     * @dev Verifies the signatures for a common operation.
     * @param functionName Name of the function for which the signature is being verified.
     * @param operationType Type of the operation.
     * @param instruction Struct containing common token operation signature data.
     * @return True if the signatures are valid, false otherwise.
     */
    function verifyCommonOpSignature(
        string memory functionName,
        TokenOpTypes.OpType operationType,
        TokenOpTypes.CommonTokenOpWithSignature memory instruction
    ) external returns (bool) {
        bytes32 _hash = getMessageHashCommon(
            functionName,
            TokenOpTypes.CommonTokenOpSignatureData({
                account: instruction.account,
                weight: instruction.weight,
                metalId: instruction.metalId,
                documentHash: instruction.documentHash
            })
        );
        bytes32 prefixedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash)
        );
        require(prefixedHash == instruction.signatureHash, "Invalid hash");

        bool isValid = validateSignatures(prefixedHash, instruction.signatures, operationType);

        // Ensure that the validation was successful
        require(isValid, "Invalid signatures");

        return true;
    }

    // CHANGED: Removed the onlyTokenManager modifier
    /**
     * @notice Overloaded function for `CommonAdminOpAddSigner` message types.
     * @dev Verifies the signatures for a common operation.
     * @param functionName Name of the function for which the signature is being verified.
     * @param instruction Struct containing common token operation signature data.
     * @return True if the signatures are valid, false otherwise.
     */
    function verifyCommonOpSignature(
        string memory functionName,
        TokenOpTypes.CommonAdminOpManageSigner memory instruction
    ) internal returns (bool) {
        bytes32 _hash = getMessageHashCommon(
            functionName,
            TokenOpTypes.CommonAdminOpManageSignerData({
                signerAddress: instruction.signData.signerAddress,
                roleName: instruction.signData.roleName,
                operationType: instruction.signData.operationType
            })
        );
        bytes32 prefixedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash)
        );
        require(prefixedHash == instruction.signatureHash, "Invalid hash");

        bool isValid = validateSignatures(
            prefixedHash,
            instruction.signatures,
            TokenOpTypes.OpType.SIGN_MANAGER_OP
        );

        // Ensure that the validation was successful
        require(isValid, "Invalid signatures");

        return true;
    }

    /**
     * @dev Validates the signatures for a given hash and operation type.
     * @param _hash Hash of the operation message.
     * @param signaturesArray Array of signatures to be validated.
     * @param operationType Type of the operation.
     * @return True if the signatures are valid, false otherwise.
     */
    function validateSignatures(
        bytes32 _hash,
        bytes[] memory signaturesArray,
        TokenOpTypes.OpType operationType
    ) internal returns (bool) {
        uint256 requiredSigs = requiredSignatures[operationType];
        require(requiredSigs >= MIN_REQUIRED_SIGNATURES, "Not enough required signers");
        require(signaturesArray.length == requiredSigs, "Invalid number of signatures");
        require(!usedHashes[_hash], "Hash has already been used");

        uint256 validSigCount = 0;
        for (uint256 i = 0; i < requiredSigs; i++) {
            address signer = recoverSigner(_hash, signaturesArray[i]);
            if (isSigner(signer, operationType) && !signatures[operationType][_hash][signer]) {
                signatures[operationType][_hash][signer] = true;
                validSigCount++;
                emit SignatureReceived(signer, _hash, getRole(operationType, signer));
            }
        }

        require(validSigCount == requiredSigs, "Not enough valid signatures");
        usedHashes[_hash] = true;
        emit SignatureValidated(msg.sender, operationType, _hash, signaturesArray);
        return true;
    }

    /**
     * @dev Returns the list of signers for a given operation type
     * @param operationType The type of operation to sign by signers group (0 for mint, 1 for release)
     */
    function getSignerRegistry(
        TokenOpTypes.OpType operationType
    ) public view returns (address[] memory) {
        uint256 sigCount = requiredSignatures[operationType];
        address[] memory signersGroup = new address[](sigCount);
        for (uint256 i = 0; i < sigCount; i++) {
            signersGroup[i] = unsortedSignersRegistry[operationType][i];
        }
        return signersGroup;
    }

    /// Changed to use the AuthorizationGuard for signer checks
    /**
     * @dev Checks if an address is a signer for a specific operation type.
     * @param _address Address to be checked.
     * @param operationType Type of the operation.
     * @return True if the address is a signer, false otherwise.
     */
    function isSigner(
        address _address,
        TokenOpTypes.OpType operationType
    ) public view returns (bool) {
        if (operationType == TokenOpTypes.OpType.MINT_OP) {
            return _authorizationGuard.hasRole(_authorizationGuard.MINT_SIGNER_ROLE(), _address);
        } else if (operationType == TokenOpTypes.OpType.RELEASE_OP) {
            return _authorizationGuard.hasRole(_authorizationGuard.RELEASE_SIGNER_ROLE(), _address);
        } else if (operationType == TokenOpTypes.OpType.SIGN_MANAGER_OP) {
            return
                _authorizationGuard.hasRole(_authorizationGuard.SIGNATURE_MANAGER_ROLE(), _address);
        } else {
            revert InvalidOperationType();
        }
    }

    /**
     * @dev Recovers the signer's address from the hash and signature.
     * @param _hash Hash of the signed message.
     * @param signature Signature to be recovered.
     * @return Address of the signer.
     */
    function recoverSigner(bytes32 _hash, bytes memory signature) internal pure returns (address) {
        bytes32 messageDigest = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash)
        );
        return messageDigest.recover(signature);
    }

    /**
     * @dev Adds new signers to the roles mapping and adds it to the signers registry.
     * @param instructions Array of signatures and signers to be added.
     */
    function addSigners(
        TokenOpTypes.CommonAdminOpManageSigner[] memory instructions
    ) public onlyAuthorizedAccess {
        for (uint32 i = 0; i < instructions.length; i++) {
            require(instructions[i].signData.signerAddress != address(0), "Invalid address");
            require(
                requiredSignatures[instructions[i].signData.operationType] < MAX_SIGNERS,
                "Maximum number of signers reached"
            );

            if (verifyCommonOpSignature("addSigners", instructions[i])) {
                _addSigner(
                    SignerEntity({
                        signerAddress: instructions[i].signData.signerAddress,
                        roleName: instructions[i].signData.roleName,
                        operationType: instructions[i].signData.operationType
                    })
                );
            }
        }
    }

    /**
     * @dev Removes signers from the roles mapping and deregisters it from the signers registry.
     * @param instructions Array of signers to be removed. Signatures are required in the instruction.
     */
    function removeSigners(
        TokenOpTypes.CommonAdminOpManageSigner[] memory instructions
    ) public onlyAuthorizedAccess {
        for (uint32 i = 0; i < instructions.length; i++) {
            TokenOpTypes.OpType opType = instructions[i].signData.operationType;
            require(
                requiredSignatures[opType] > MIN_REQUIRED_SIGNATURES,
                "Minimum number of signers would be violated"
            );
            if (verifyCommonOpSignature("removeSigners", instructions[i])) {
                _removeSigner(
                    SignerEntity({
                        signerAddress: instructions[i].signData.signerAddress,
                        roleName: instructions[i].signData.roleName,
                        operationType: opType
                    })
                );
            }
        }
    }

    function _removeSigner(SignerEntity memory signer) internal {
        if (isSigner(signer.signerAddress, signer.operationType)) {
            // Decrease the required signatures count
            requiredSignatures[signer.operationType]--;

            // Clear role for wallet address
            roles[signer.operationType][signer.signerAddress] = "";

            _authorizationGuard.setSignerRole(
                signer.signerAddress,
                signer.operationType,
                false,
                msg.sender
            );

            emit SignerRemoved(signer.roleName, signer.signerAddress, signer.operationType);
        }
    }

    function _addSigner(SignerEntity memory signer) internal {
        if (!isSigner(signer.signerAddress, signer.operationType)) {
            // Add signer address to registry list
            unsortedSignersRegistry[signer.operationType][
                requiredSignatures[signer.operationType]
            ] = signer.signerAddress;

            requiredSignatures[signer.operationType] += 1;

            roles[signer.operationType][signer.signerAddress] = signer.roleName;

            _authorizationGuard.setSignerRole(
                signer.signerAddress,
                signer.operationType,
                true,
                msg.sender
            );

            emit SignerAdded(signer.roleName, signer.signerAddress, signer.operationType);
        }
    }

    /**
     * @dev Retrieves the role of a signer for a specific operation type.
     * @param operationType Type of the operation.
     * @param signer Address of the signer.
     * @return Role of the signer.
     */
    function getRole(
        TokenOpTypes.OpType operationType,
        address signer
    ) public view returns (string memory) {
        if (operationType == TokenOpTypes.OpType.MINT_OP) {
            require(
                _authorizationGuard.hasRole(_authorizationGuard.MINT_SIGNER_ROLE(), signer),
                "Address is not a mint signer"
            );
        } else if (operationType == TokenOpTypes.OpType.RELEASE_OP) {
            require(
                _authorizationGuard.hasRole(_authorizationGuard.RELEASE_SIGNER_ROLE(), signer),
                "Address is not a release signer"
            );
        } else if (operationType == TokenOpTypes.OpType.SIGN_MANAGER_OP) {
            require(
                _authorizationGuard.hasRole(_authorizationGuard.SIGNATURE_MANAGER_ROLE(), signer),
                "Address is not a signature manager signer"
            );
        } else {
            revert InvalidOperationType();
        }

        return roles[operationType][signer];
    }
}
