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
    ADMIN_OP
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


    beforeEach(async function () {
        [owner, admin, user1, user2, ...companyWallets] = await ethers.getSigners();

        const admins = [owner];
        const authorized = [owner, admin];

        adminOpSignersArray = [
            { signerAddress: owner.address, roleName: "Signature Operator", operationType: OpType.ADMIN_OP },
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
                mintSigners: mintSignersArray,
                releaseSigners: releaseSignersArray
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

    describe("Minting and Locking", function () {
        it("Silver Token: should mint and lock tokens with proper signatures ", async function () {

            const instruction = {
                account: user1.address,
                weight: 1, // 1 gram
                metalId: 1, // Silver Token
                documentHash: ethers.id("document1"),
                signatureHash: ethers.ZeroHash,
                signatures: [] as string[]
            };
            const amountOut = ethers.parseEther(instruction.weight.toString());
            const metalToken = instruction.metalId === 1 ? silverToken : goldToken;

            // Generate signature hash
            const messageHash = await multiSigValidation["getMessageHashCommon(string,(address,uint48,uint8,string))"](
                "mintAndLockTokens",
                {
                    account: instruction.account,
                    weight: instruction.weight,
                    metalId: instruction.metalId,
                    documentHash: instruction.documentHash
                });

            // Create the Ethereum Signed Message
            const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));
            instruction.signatureHash = prefixedHash;

            // Sign the message hash with required signers
            for (let i = 0; i < mintSigners.length; i++) {
                const signature = await mintSigners[i].signMessage(ethers.getBytes(prefixedHash));
                instruction.signatures.push(signature);
            }

            // Mint and lock tokens
            await expect(tokenManager.mintAndLockTokens([instruction]))
                .to.emit(metalToken, "Transfer")
                .withArgs(ethers.ZeroAddress, user1.address, amountOut);

            // Check balances
            expect(await metalToken.balanceOf(user1.address)).to.equal(0); // All tokens should be locked
            expect(await metalToken.lockedBalanceOf(user1.address)).to.equal(amountOut);
        });
        it("Gold Token: should mint and lock tokens with proper signatures ", async function () {

            const instruction = {
                account: user1.address,
                weight: 1, // 1 gram
                metalId: 0, // Gold metal
                documentHash: ethers.id("document1"),
                signatureHash: ethers.ZeroHash,
                signatures: [] as string[]
            };
            const amountOut = ethers.parseEther(instruction.weight.toString());
            const metalToken = instruction.metalId === 1 ? silverToken : goldToken;

            // Generate signature hash
            const messageHash = await multiSigValidation["getMessageHashCommon(string,(address,uint48,uint8,string))"](
                "mintAndLockTokens",
                {
                    account: instruction.account,
                    weight: instruction.weight,
                    metalId: instruction.metalId,
                    documentHash: instruction.documentHash
                });

            // Create the Ethereum Signed Message
            const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));
            instruction.signatureHash = prefixedHash;

            // Sign the message hash with required signers
            for (let i = 0; i < mintSigners.length; i++) {
                const signature = await mintSigners[i].signMessage(ethers.getBytes(prefixedHash));
                instruction.signatures.push(signature);
            }

            // Mint and lock tokens
            await expect(tokenManager.mintAndLockTokens([instruction]))
                .to.emit(metalToken, "Transfer")
                .withArgs(ethers.ZeroAddress, user1.address, amountOut);

            // Check balances
            expect(await metalToken.balanceOf(user1.address)).to.equal(0); // All tokens should be locked
            expect(await metalToken.lockedBalanceOf(user1.address)).to.equal(amountOut);
        });
    });

    describe("Releasing Tokens", function () {
        it("Gold Token: should release locked tokens with proper signatures", async function () {
            const tokenType = 0;

            // Mint tokens
            const mintInstruction = {
                account: user1.address,
                weight: 1000000,
                metalId: tokenType,
                documentHash: ethers.id("document1"),
                signatureHash: ethers.ZeroHash,
                signatures: [] as string[]
            };

            const amountOut = ethers.parseEther(mintInstruction.weight.toString());
            const metalToken = mintInstruction.metalId === 1 ? silverToken : goldToken;



            // Generate signature hash
            const messageHash = await multiSigValidation["getMessageHashCommon(string,(address,uint48,uint8,string))"]("mintAndLockTokens",
                mintInstruction);

            // Create the Ethereum Signed Message
            const prefixedHashMint = ethers.hashMessage(ethers.getBytes(messageHash));

            mintInstruction.signatureHash = prefixedHashMint;

            // Sign the mint message hash with required signers
            for (let i = 0; i < mintSigners.length; i++) {
                const signature = await mintSigners[i].signMessage(ethers.getBytes(prefixedHashMint));
                mintInstruction.signatures.push(signature);
            }

            // Mint and lock tokens
            await tokenManager.mintAndLockTokens([mintInstruction]);

            // Release the tokens
            const releaseInstruction = {
                account: user1.address,
                weight: 1000000,
                metalId: tokenType,
                documentHash: ethers.id("document2"),
                signatureHash: ethers.ZeroHash,
                signatures: [] as string[]
            };

            // Generate signature hash for release
            const releaseMessageHash = await multiSigValidation["getMessageHashCommon(string,(address,uint48,uint8,string))"](
                "releaseTokens",
                releaseInstruction
            );

            // Create the Ethereum Signed Message
            const prefixedHashRelease = ethers.hashMessage(ethers.getBytes(releaseMessageHash));
            releaseInstruction.signatureHash = prefixedHashRelease;

            // Sign the message hash with required release signers
            for (let i = 0; i < releaseSigners.length; i++) {
                const signature = await releaseSigners[i].signMessage(ethers.getBytes(prefixedHashRelease));
                releaseInstruction.signatures.push(signature);
            }

            // Release tokens
            await expect(tokenManager.releaseTokens([releaseInstruction]))
                .to.emit(metalToken, "LockedBalanceChanged")
                .withArgs(user1.address, 0);

            // Check balances after release
            expect(await metalToken.balanceOf(user1.address)).to.equal(amountOut);
            expect(await metalToken.lockedBalanceOf(user1.address)).to.equal(0);
        });
    });

});