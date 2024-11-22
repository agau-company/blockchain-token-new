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
    SIGN_MANAGER_OP
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

    async function signMessages(signerAddress: string, roleName: string, operationType: OpType, functionName: string, signers: SignerWithAddress[]) {

        const instruction = {
            signData: {
                signerAddress: signerAddress,
                roleName: roleName,
                operationType: operationType
            },
            signatureHash: ethers.ZeroHash,
            signatures: [] as string[]
        };

        // Create valid signatures from existing signers
        const messageHash = await multiSigValidation["getMessageHashCommon(string,(address,string,uint8))"](functionName, instruction.signData);
        const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));
        const signatures = await Promise.all(
            signers.map(signer => signer.signMessage(ethers.getBytes(prefixedHash)))
        );
        instruction.signatureHash = prefixedHash;
        instruction.signatures = signatures;
        return instruction;
    }

    async function addSigners(signerAddress: string, roleName: string, operationType: OpType, signers: SignerWithAddress[]) {
        const instruction = await signMessages(signerAddress, roleName, operationType, "addSigners", signers);
        return multiSigValidation.addSigners([instruction]);
    }

    async function removeSigners(signerAddress: string, roleName: string, operationType: OpType, signers: SignerWithAddress[]) {
        const instruction = await signMessages(signerAddress, roleName, operationType, "removeSigners", signers);
        return multiSigValidation.removeSigners([instruction]);
    }


    // Helper function to create and sign an instruction
    async function createAndSignInstruction(
        account: string,
        weight: number,
        metalId: number,
        documentHash: string,
        signers: SignerWithAddress[],
        operationType: string
    ) {
        const instruction = {
            account,
            weight,
            metalId,
            documentHash,
            signatureHash: ethers.ZeroHash,
            signatures: [] as string[]
        };

        const messageHash = await multiSigValidation["getMessageHashCommon(string,(address,uint48,uint8,string))"](
            operationType,
            {
                account: instruction.account,
                weight: instruction.weight,
                metalId: instruction.metalId,
                documentHash: instruction.documentHash
            }
        );

        const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));
        instruction.signatureHash = prefixedHash;

        for (const signer of signers) {
            const signature = await signer.signMessage(ethers.getBytes(prefixedHash));
            instruction.signatures.push(signature);
        }

        return instruction;
    }


    // Helper function to mint and lock tokens
    async function mintAndLockTokens(
        account: string,
        weight: number,
        metalId: number,
        documentHash: string,
        signers: SignerWithAddress[]
    ) {
        const instruction = await createAndSignInstruction(
            account,
            weight,
            metalId,
            documentHash,
            signers,
            "mintAndLockTokens"
        );
        return tokenManager.mintAndLockTokens([instruction]);
    }

    // Helper function to release tokens
    async function releaseTokens(
        account: string,
        weight: number,
        metalId: number,
        documentHash: string,
        signers: SignerWithAddress[]
    ) {
        const instruction = await createAndSignInstruction(
            account,
            weight,
            metalId,
            documentHash,
            signers,
            "releaseTokens"
        );
        return tokenManager.releaseTokens([instruction]);
    }


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
            { signerAddress: owner.address, roleName: "Signature Operator", operationType: OpType.SIGN_MANAGER_OP },
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

        // Grant role to signature contract
        await authorizationGuard.grantRole(await authorizationGuard.SIGN_ROLES_MANAGER_ROLE(), multiSigValidation.target);

        // Setup the signers
        await multiSigValidation.initialize(adminOpSignersArray, mintOpSignersArray, releaseOpSignersArray);


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

            await expect(addSigners(newSigner, "NewSigner", OpType.SIGN_MANAGER_OP, adminOpSigners)).to.emit(multiSigValidation, "SignerAdded")
                .withArgs("NewSigner", newSigner, OpType.SIGN_MANAGER_OP);

            expect(await multiSigValidation.isSigner(newSigner, OpType.SIGN_MANAGER_OP)).to.be.true;
        });
        it("should not allow adding a new signer with invalid signers group", async function () {
            const newSigner = user1.address;

            await expect(addSigners(newSigner, "NewSigner", OpType.SIGN_MANAGER_OP, [mintOpSigners[0]])).to.be.revertedWith("Not enough valid signatures");

            // expect(await multiSigValidation.isSigner(newSigner, OpType.SIGN_MANAGER_OP)).to.be.true;
        });
        it("should allow removing a signer", async function () {
            await expect(removeSigners(mintOpSignersArray[0].signerAddress as string, mintOpSignersArray[0].roleName, mintOpSignersArray[0].operationType, adminOpSigners))
                .to.emit(multiSigValidation, "SignerRemoved")
                .withArgs(mintOpSignersArray[0].roleName, mintOpSignersArray[0].signerAddress, mintOpSignersArray[0].operationType);

            expect(await multiSigValidation.isSigner(mintOpSignersArray[0].signerAddress, mintOpSignersArray[0].operationType)).to.be.false;
        });
        it("should mint and lock tokens with proper signatures after changing operation signers", async function () {
            const message = {
                account: user1.address,
                weight: 100,
                metalId: 1,
                documentHash: "0x1234567890"
            };
            const metalToken = message.metalId === 0 ? goldToken : silverToken;
            const amountOut = ethers.parseEther(message.weight.toString());

            await expect(removeSigners(mintOpSignersArray[0].signerAddress as string, mintOpSignersArray[0].roleName, mintOpSignersArray[0].operationType, adminOpSigners))
                .to.emit(multiSigValidation, "SignerRemoved")
                .withArgs(mintOpSignersArray[0].roleName, mintOpSignersArray[0].signerAddress, mintOpSignersArray[0].operationType);

            expect(await multiSigValidation.isSigner(mintOpSignersArray[0].signerAddress, mintOpSignersArray[0].operationType)).to.be.false;


            // Remove signer at index 0
            let newMintOpSigners = mintOpSigners.slice(1);

            // Use new signers array without the signer at index 0
            await expect(mintAndLockTokens(message.account, message.weight, message.metalId, message.documentHash, newMintOpSigners))
                .to.emit(metalToken, "Transfer")
                .withArgs(ethers.ZeroAddress, message.account, amountOut);



            await expect(releaseTokens(message.account, message.weight, message.metalId, message.documentHash, releaseOpSigners))
                .to.emit(metalToken, "LockedBalanceChanged")
                .withArgs(user1.address, 0);
        });
        it("should release tokens with proper signatures after adding a signer to release operation", async function () {
            const toAdd = {
                signerAddress: user1.address,
                roleName: "New Signer",
                operationType: OpType.RELEASE_OP
            }
            const message = {
                account: user1.address,
                weight: 100,
                metalId: 1,
                documentHash: "0x1234567890"
            };
            const metalToken = message.metalId === 0 ? goldToken : silverToken;
            const amountOut = ethers.parseEther(message.weight.toString());

            await expect(addSigners(toAdd.signerAddress as string, toAdd.roleName, toAdd.operationType, adminOpSigners))
                .to.emit(multiSigValidation, "SignerAdded")
                .withArgs(toAdd.roleName, toAdd.signerAddress, toAdd.operationType);

            expect(await multiSigValidation.isSigner(toAdd.signerAddress, toAdd.operationType)).to.be.true;


            await expect(mintAndLockTokens(message.account, message.weight, message.metalId, message.documentHash, mintOpSigners))
                .to.emit(metalToken, "Transfer")
                .withArgs(ethers.ZeroAddress, message.account, amountOut);


            // Remove signer at index 0
            let newReleaseOpSigners = releaseOpSigners;
            newReleaseOpSigners.push(user1)

            // Use new signers array without the signer at index 0
            await expect(releaseTokens(message.account, message.weight, message.metalId, message.documentHash, newReleaseOpSigners))
                .to.emit(metalToken, "LockedBalanceChanged")
                .withArgs(user1.address, 0);
        });
        it("should not allow removing signer that will result in no signers for role", async function () {
            const toRemove = {
                signerAddress: releaseOpSignersArray[0].signerAddress as string,
                roleName: releaseOpSignersArray[0].roleName,
                operationType: releaseOpSignersArray[0].operationType
            }

            await expect(removeSigners(toRemove.signerAddress as string, toRemove.roleName, toRemove.operationType, releaseOpSigners))
                .to.be.revertedWith('Minimum number of signers would be violated');
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
