import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import * as deployment from "../../../scripts/helpers/deploy";
import { TokenOpTypes } from "../../../types/lib/agau-common/admin-ops/interface/IFeesWhitelistManager";

import {
    AuthorizationGuard,
    MetalToken,
    TokenManager,
    FeesManager,
    MultiSigValidation
} from "../../../types";
import { trackDeploymentNoLogs } from "../../../scripts/helpers/utils";
import { SignerEntityStruct } from "../../../scripts/signature/signature_interfaces";
import { getFeeRate } from "../../../scripts/helpers/env";
import { getTokensMetadata, TokenIdentifier } from "../../../scripts/config/token/config";


enum OpType {
    MINT_OP,
    RELEASE_OP,
    SIGN_MANAGER_OP
}

describe("Metal Token System", function () {
    let authorizationGuard: AuthorizationGuard;
    let goldToken: MetalToken;
    let silverToken: MetalToken;
    let metalTokenBeacon: Contract;
    let tokenManager: TokenManager;
    let feesManager: FeesManager;
    let multiSigValidation: MultiSigValidation;
    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let companyWallets: SignerWithAddress[];
    let mintSigners: SignerWithAddress[];
    let releaseSigners: SignerWithAddress[];
    let mintSignersArray: SignerEntityStruct[];
    let releaseSignersArray: SignerEntityStruct[];
    let adminOpSigners: SignerWithAddress[];
    let adminOpSignersArray: SignerEntityStruct[];

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

        adminOpSignersArray = [
            { signerAddress: owner.address, roleName: "Signature Operator", operationType: OpType.SIGN_MANAGER_OP },
        ]
        mintSignersArray = [
            { signerAddress: companyWallets[0].address, roleName: "Warehouse admin", operationType: OpType.MINT_OP },
            { signerAddress: companyWallets[1].address, roleName: "Director", operationType: OpType.MINT_OP },
            { signerAddress: companyWallets[2].address, roleName: "Token manager", operationType: OpType.MINT_OP },
            { signerAddress: companyWallets[3].address, roleName: "Auditor", operationType: OpType.MINT_OP },
        ];

        releaseSignersArray = [
            { signerAddress: companyWallets[0].address, roleName: "Auditor", operationType: OpType.RELEASE_OP },
        ];

        adminOpSigners = [owner];
        releaseSigners = companyWallets.slice(0, releaseSignersArray.length);
        mintSigners = companyWallets.slice(0, mintSignersArray.length);

        const expectedTokenManagerContractAddress = ethers.getCreateAddress({
            from: owner.address,
            // +3 as current nonce +2 (sum +3) is for `FeesManager` deployment and +1 is for `TokenFactory` deployment
            nonce: (await owner.getNonce()) + 5,
        });

        const expectedMultiSigValidationContractAddress = ethers.getCreateAddress({
            from: owner.address,
            nonce: (await owner.getNonce()) + 1,
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
                multiSigSigners: adminOpSignersArray, //TODO: remove
                mintSigners: mintSignersArray,        //TODO: remove
                releaseSigners: releaseSignersArray   // TODO: remove
            }),
            `MultiSigValidation`
        ) as MultiSigValidation;

        // Grant role to signature contract
        await authorizationGuard.grantRole(await authorizationGuard.SIGN_ROLES_MANAGER_ROLE(), multiSigValidation.target);

        await multiSigValidation.initialize(adminOpSignersArray, mintSignersArray, releaseSignersArray);

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

    describe("Minting and Locking", function () {
        it("should mint and lock silver tokens with proper signatures ", async function () {
            const weight = 1;
            const amountOut = ethers.parseEther(weight.toString());

            // Mint and lock tokens
            await expect(await mintAndLockTokens(user1.address, weight, 1, ethers.id("document1"), mintSigners))
                .to.emit(silverToken, "Transfer")
                .withArgs(ethers.ZeroAddress, user1.address, amountOut);

            // Check balances
            expect(await silverToken.balanceOf(user1.address)).to.equal(0); // All tokens should be locked
            expect(await silverToken.lockedBalanceOf(user1.address)).to.equal(amountOut);
        });

        it("should mint and lock gold tokens with proper signatures ", async function () {
            const weight = 1;
            const amountOut = ethers.parseEther(weight.toString());

            await expect(mintAndLockTokens(user1.address, 1, 0, ethers.id("document1"), mintSigners))
                .to.emit(goldToken, "Transfer")
                .withArgs(ethers.ZeroAddress, user1.address, amountOut);

            // Check balances
            expect(await goldToken.balanceOf(user1.address)).to.equal(0); // All tokens should be locked
            expect(await goldToken.lockedBalanceOf(user1.address)).to.equal(amountOut);

        });
        it("should not allow using the same hash ", async function () {
            const weight = 1;

            // Mint and lock tokens once
            await mintAndLockTokens(user1.address, weight, 1, ethers.id("document1"), mintSigners);

            // Mint and lock tokens again with same hash
            await expect(mintAndLockTokens(user1.address, weight, 1, ethers.id("document1"), mintSigners))
                .to.be.revertedWith("Hash has already been used");
        });
        it("should fail to mint and lock tokens with insufficient signatures", async function () {
            const instruction = {
                account: user1.address,
                weight: 1,
                metalId: 1, // Silver Token
                documentHash: ethers.id("document1"),
                signatureHash: ethers.ZeroHash,
                signatures: [] as string[]
            };

            const messageHash = await multiSigValidation["getMessageHashCommon(string,(address,uint48,uint8,string))"](
                "mintAndLockTokens",
                {
                    account: instruction.account,
                    weight: instruction.weight,
                    metalId: instruction.metalId,
                    documentHash: instruction.documentHash
                });

            const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));
            instruction.signatureHash = prefixedHash;

            // Sign with only one signer (insufficient)
            const signature = await mintSigners[0].signMessage(ethers.getBytes(prefixedHash));
            instruction.signatures.push(signature);

            await expect(tokenManager.mintAndLockTokens([instruction]))
                .to.be.revertedWith("Invalid number of signatures");
        });
        it("should fail to mint and lock tokens with invalid signer", async function () {
            // Replace the last signer with an invalid signer
            let signers = mintSigners;
            signers[signers.length - 1] = user2;

            await expect(mintAndLockTokens(user1.address, 1, 0, ethers.id("document1"), signers))
                .to.be.revertedWith("Not enough valid signatures");
        });
    });

    describe("Releasing Tokens", function () {
        it("should release locked gold tokens with proper signatures", async function () {
            const tokenType = 0;
            const weight = 1000000;
            const amountOut = ethers.parseEther(weight.toString());
            const metalToken = tokenType ? silverToken : goldToken;

            // Mint and lock tokens
            await mintAndLockTokens(user1.address, weight, tokenType, ethers.id("document1"), mintSigners);

            // Release tokens
            await expect(releaseTokens(user1.address, weight, tokenType, ethers.id("document2"), releaseSigners))
                .to.emit(metalToken, "LockedBalanceChanged")
                .withArgs(user1.address, 0);

            // Check balances after release
            expect(await metalToken.balanceOf(user1.address)).to.equal(amountOut);
            expect(await metalToken.lockedBalanceOf(user1.address)).to.equal(0);
        });
        it("should release locked silver tokens with proper signatures", async function () {
            const tokenType = 1;
            const weight = 1000000;
            const amountOut = ethers.parseEther(weight.toString());
            const metalToken = tokenType ? silverToken : goldToken;

            // Mint and lock tokens
            await mintAndLockTokens(user1.address, weight, tokenType, ethers.id("document1"), mintSigners);

            // Release tokens
            await expect(releaseTokens(user1.address, weight, tokenType, ethers.id("document2"), releaseSigners))
                .to.emit(metalToken, "LockedBalanceChanged")
                .withArgs(user1.address, 0);

            // Check balances after release
            expect(await metalToken.balanceOf(user1.address)).to.equal(amountOut);
            expect(await metalToken.lockedBalanceOf(user1.address)).to.equal(0);
        });
        it("should fail to release tokens with insufficient balance", async function () {
            const tokenType = 0;
            const weight = 1000000;
            const amountOut = ethers.parseEther(weight.toString());
            const metalToken = tokenType ? silverToken : goldToken;

            await expect(mintAndLockTokens(user1.address, weight, tokenType, ethers.id("document1"), mintSigners))
                .to.emit(metalToken, "Transfer")
                .withArgs(ethers.ZeroAddress, user1.address, amountOut);

            await expect(releaseTokens(user1.address, weight + 100, 0, ethers.id("document7"), releaseSigners))
                .to.be.revertedWith("Insufficient locked balance");
        });
    });

});