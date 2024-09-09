import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { FeesManager, MetalToken, TokenManager, MultiSigValidation, AuthorizationGuard } from "../../../types";
import { Contract } from "ethers";
import { SignerEntityStruct } from "../../../scripts/signature/signature_interfaces";
import { trackDeploymentNoLogs } from "../../../scripts/helpers/utils";
import * as deployment from "../../../scripts/helpers/deploy";
import { getFeeRate } from "../../../scripts/helpers/env";
import { getTokensMetadata, TokenIdentifier } from "../../../scripts/config/token/config";

enum OpType {
    MINT_OP,
    RELEASE_OP,
    ADMIN_OP
}

describe("MultiSigValidation", function () {
    let authorizationGuard: AuthorizationGuard;
    let goldToken: MetalToken;
    let silverToken: MetalToken;
    let metalTokenBeacon: Contract;
    let tokenManager: TokenManager;
    let feesManager: FeesManager;
    let multiSigValidation: MultiSigValidation;


    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let companyWallets: SignerWithAddress[];
    let adminOpSigners: SignerWithAddress[];
    let mintOpSigners: SignerWithAddress[];
    let releaseOpSigners: SignerWithAddress[];
    let mintOpSignersArray: SignerEntityStruct[];
    let adminOpSignersArray: SignerEntityStruct[];
    let releaseOpSignersArray: SignerEntityStruct[];

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let user: SignerWithAddress;

    beforeEach(async function () {
        [owner, admin, user1, user2, ...companyWallets] = await ethers.getSigners();

        const admins = [owner];
        const authorized = [owner, admin];


        mintOpSignersArray = [
            { signerAddress: companyWallets[0].address, roleName: "Warehouse admin", operationType: OpType.MINT_OP },
            { signerAddress: companyWallets[1].address, roleName: "Director", operationType: OpType.MINT_OP },
            { signerAddress: companyWallets[2].address, roleName: "Token manager", operationType: OpType.MINT_OP },
            { signerAddress: companyWallets[3].address, roleName: "Auditor", operationType: OpType.MINT_OP },
        ];

        releaseOpSignersArray = [
            { signerAddress: companyWallets[0].address, roleName: "Auditor", operationType: OpType.RELEASE_OP },
        ];

        adminOpSignersArray = [
            { signerAddress: owner.address, roleName: "Signature Operator", operationType: OpType.ADMIN_OP },
        ]

        adminOpSigners = [owner];
        releaseOpSigners = companyWallets.slice(0, releaseOpSignersArray.length);
        mintOpSigners = companyWallets.slice(0, mintOpSignersArray.length);

        const expectedTokenManagerContractAddress = ethers.getCreateAddress({
            from: owner.address,
            // +3 as current nonce +2 (sum +3) is for `FeesManager` deployment and +1 is for `TokenFactory` deployment
            nonce: (await owner.getNonce()) + 5,
        });

        // Deploy `authorizationGuard`
        authorizationGuard = await trackDeploymentNoLogs(
            () => deployment.deployAuthorizationGuard(owner, {
                adminAddresses: admins,
                authorizedAccounts: authorized,
                trustedContracts: [expectedTokenManagerContractAddress]
            }),
            `AuthorizationGuard`,
        );

        // Deploy Multi Signature Validation contract
        multiSigValidation = await trackDeploymentNoLogs(
            () => deployment.deployMultiSigValidation(owner, {
                authorizationGuard: authorizationGuard.target,
                multiSigSigners: adminOpSignersArray,
                mintSigners: mintOpSignersArray,
                releaseSigners: releaseOpSignersArray
            }),
            `MultiSigValidation`
        ) as MultiSigValidation;


        // Deploy `MetalToken` beacon
        metalTokenBeacon = await trackDeploymentNoLogs(
            () => deployment.deployMetalTokenBeacon(owner),
            `MetalToken`,
        );


        // Deploy `FeesManager` proxy
        const expectedTokenManagerAddress = ethers.getCreateAddress({
            from: owner.address,
            // +3 as current nonce +2 (sum +3) is for `FeesManager` deployment and +1 is for `TokenFactory` deployment
            nonce: (await owner.getNonce()) + 2,
        });

        const feeRate = getFeeRate();

        const feeWallet = owner.address;
        const feesManagerProxy = await trackDeploymentNoLogs(
            () =>
                deployment.deployFeesManager(owner, {
                    feeWallet: feeWallet,
                    txFeeRate: feeRate,
                    minTxFee: 0n,
                    maxTxFee: ethers.MaxUint256,
                    zeroFeeAccounts: [feeWallet, expectedTokenManagerAddress],
                    authorizationGuard: authorizationGuard.target
                }),
            `FeesManager`,
        );


        // Deploy `TokenFactory` contract
        const tokensMetadata = getTokensMetadata(owner.address, feesManagerProxy.target, authorizationGuard.target);
        const tokenFactory = await trackDeploymentNoLogs(
            () =>
                deployment.deployTokenFactory(owner, {
                    owner: owner.address,
                    tokenBeacon: metalTokenBeacon.target,
                    initTokens: tokensMetadata,
                }),
            `TokenFactory`,
        );

        // Deploy `TokenManager` contract
        tokenManager = await trackDeploymentNoLogs(
            () =>
                deployment.deployTokenManager(owner, {
                    tokenFactory: tokenFactory.target,
                    feesManager: feesManagerProxy.target,
                    adminAddresses: admins,
                    authorizedAddresses: authorized,
                    multiSigValidationAddress: multiSigValidation.target,
                    authorizedGuardAddress: authorizationGuard.target
                }),
            `TokenManager`,
        ) as TokenManager;

        // Grant roles
        await authorizationGuard.grantRole(await authorizationGuard.TOKEN_MANAGER_ROLE(), tokenManager.target);
        await authorizationGuard.grantRole(await authorizationGuard.AUTHORIZED_ROLE(), tokenManager.target);

        // Must be retrieved like this as these are beacon proxies created during the deployment of `TokenFactory`
        goldToken = await ethers.getContractAt(
            `MetalToken`,
            await tokenFactory.tokenForId(TokenIdentifier.Gold),
        );

        silverToken = await ethers.getContractAt(
            `MetalToken`,
            await tokenFactory.tokenForId(TokenIdentifier.Silver),
        );

    });

    describe("Initialization", function () {
        it("should initialize with correct signers", async function () {
            for (let signerObj of mintOpSignersArray) {
                expect(await multiSigValidation.isSigner(signerObj.signerAddress, OpType.MINT_OP)).to.be.true;
                expect(await multiSigValidation.getRole(OpType.MINT_OP, signerObj.signerAddress)).to.equal(signerObj.roleName);
            }
            for (let signerObj of releaseOpSignersArray) {
                expect(await multiSigValidation.isSigner(signerObj.signerAddress, OpType.RELEASE_OP)).to.be.true;
            }
        });
    });

    describe("Adding and Removing Signers", function () {
        it("should allow adding a new signer", async function () {
            const newSigner = user1.address;

            const instruction = {
                signData: {
                    signerAddress: newSigner,
                    roleName: "NewSigner",
                    operationType: OpType.ADMIN_OP
                },
                signatureHash: ethers.ZeroHash,
                signatures: [] as string[]
            };

            // Create valid signatures from existing signers
            const messageHash = await multiSigValidation["getMessageHashCommon(string,(address,string,uint8))"]("addSigners", instruction.signData);

            // Hash the message with the Ethereum prefix
            const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));

            const signatures = await Promise.all(
                adminOpSigners.map(signer => signer.signMessage(ethers.getBytes(prefixedHash)))
            );
            instruction.signatureHash = prefixedHash;
            instruction.signatures = signatures;

            await expect(multiSigValidation.connect(admin).addSigners([instruction]))
                .to.emit(multiSigValidation, "SignerAdded")
                .withArgs("NewSigner", newSigner, OpType.ADMIN_OP);

            expect(await multiSigValidation.isSigner(newSigner, OpType.ADMIN_OP)).to.be.true;
        });
        it("should allow removing a signer", async function () {
            const instruction = {
                signData: {
                    signerAddress: mintOpSignersArray[0].signerAddress,
                    roleName: mintOpSignersArray[0].roleName,
                    operationType: mintOpSignersArray[0].operationType
                },
                signatureHash: ethers.ZeroHash,
                signatures: [] as string[]
            };

            // Create valid signatures from existing signers
            const messageHash = await multiSigValidation["getMessageHashCommon(string,(address,string,uint8))"]("removeSigners", instruction.signData);
            const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));
            const signatures = await Promise.all(
                adminOpSigners.map(signer => signer.signMessage(ethers.getBytes(prefixedHash)))
            );
            instruction.signatureHash = prefixedHash;
            instruction.signatures = signatures;

            await expect(multiSigValidation.connect(admin).removeSigners([instruction]))
                .to.emit(multiSigValidation, "SignerRemoved")
                .withArgs(mintOpSignersArray[0].roleName, mintOpSignersArray[0].signerAddress, mintOpSignersArray[0].operationType);

            expect(await multiSigValidation.isSigner(mintOpSignersArray[0].signerAddress, mintOpSignersArray[0].operationType)).to.be.false;
        });
    });

    describe("Signature Validation", function () {
        it("should validate signatures correctly", async function () {
            const message = {
                account: user1.address,
                weight: 100,
                metalId: 1,
                documentHash: "0x1234567890"
            };

            const messageHash = await multiSigValidation["getMessageHashCommon(string,(address,uint48,uint8,string))"]("testFunction", { account: message.account, weight: message.weight, metalId: message.metalId, documentHash: message.documentHash });
            const prefixHash = ethers.hashMessage(ethers.getBytes(messageHash));

            const signatures = [];
            for (const signer of mintOpSignersArray) {
                const signerWallet = await ethers.getSigner(signer.signerAddress as string);
                const signature = await signerWallet.signMessage(ethers.getBytes(prefixHash));
                signatures.push(signature);
            }

            const instruction = {
                ...message,
                signatureHash: prefixHash,
                signatures: signatures
            };

            await expect(multiSigValidation.connect(owner).verifyCommonOpSignature("testFunction", OpType.MINT_OP, instruction)).to.emit(multiSigValidation, "SignatureValidated");

        });
    });

    describe("Getter Functions", function () {
        it("should return correct signer registry", async function () {
            const signers = await multiSigValidation.getSignerRegistry(OpType.MINT_OP);
            for (const signer of mintOpSignersArray) {
                expect(signers).to.include(signer.signerAddress);
            }
        });

        it("should return correct role for all signers", async function () {
            // Check mint signers
            for (const signer of mintOpSignersArray) {
                const role = await multiSigValidation.getRole(OpType.MINT_OP, signer.signerAddress);
                expect(role).to.equal(signer.roleName);
            }

            // Check release signers
            for (const signer of releaseOpSignersArray) {
                const role = await multiSigValidation.getRole(OpType.RELEASE_OP, signer.signerAddress);
                expect(role).to.equal(signer.roleName);
            }
        });
    });
});
