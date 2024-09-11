import { ethers, tenderly, upgrades } from "hardhat";
import { chainIds } from "../../hardhat.config";

import { trackDeployment, trackTransaction, updateDeploymentsJson } from "../helpers/utils";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { TokenIdentifier, getTokensMetadata } from "../config/token/config";
import { getFeeRate, getFeeWallet } from "../helpers/env";

import * as deployment from "../helpers/deploy";
import { SignerEntityStruct } from "../signature/signature_interfaces";

export enum OpType {
    MINT_OP,
    RELEASE_OP,
    ADMIN_OP
}

const feesWallet = getFeeWallet();


const roles = [
    "Warehouse admin",
    "Director",
    "Token manager",
    "Auditor",
];


const tokenFactoryOwner = feesWallet;


const isTestnetDeployment = async (): Promise<boolean> => {
    return (await ethers.provider.getNetwork()).chainId === chainIds.tenderly;
};

export let deployerAddr: string;

export const fullDeploy = async (): Promise<void> => {
    const [deployer, backendWallet, signer1, signer2, signer3, signer4] = await ethers.getSigners();


    const adminAddresses = [
        deployer.address,
    ];

    // Wallets who must sign the message to authorize a transaction such as `mintAndLockTokens`, `releaseTokens`, `burnTokens`
    const signers = [signer1.address, signer2.address, signer3.address, signer4.address];

    const mintSigners: SignerEntityStruct[] = [
        { signerAddress: signer1.address, roleName: "Warehouse admin", operationType: OpType.MINT_OP },
        { signerAddress: signer2.address, roleName: "Director", operationType: OpType.MINT_OP },
        { signerAddress: signer3.address, roleName: "Token manager", operationType: OpType.MINT_OP },
        { signerAddress: signer4.address, roleName: "Auditor", operationType: OpType.MINT_OP },
    ];

    const releaseSigners: SignerEntityStruct[] = [
        { signerAddress: signer4.address, roleName: "Auditor", operationType: OpType.RELEASE_OP },
    ];

    const multiSigSigners: SignerEntityStruct[] = [
        { signerAddress: signer1.address, roleName: "Signature Manager", operationType: OpType.ADMIN_OP },
    ];

    // Wallets who can call the TokenManager and other contract functions such as `mintAndLockTokens`, `releaseTokens`, should be the backend wallet.
    const authorizedAdmins = [deployer.address, backendWallet.address];

    // console.log(`Signers:`, { signer1: signer1.address, signer2: signer2.address, signer3: signer3.address, signer4: signer4.address });

    deployerAddr = deployer.address;
    const testnetDeployment = await isTestnetDeployment();

    if (testnetDeployment) {
        // Top up the deployer account with ETH on Tenderly testnet
        await ethers.provider.send(`tenderly_setBalance`, [
            [deployerAddr],
            ethers.toQuantity(ethers.parseUnits(`1000`, `ether`)),
        ]);
    }

    const balance = (await ethers.provider.getBalance(deployerAddr)).toString();
    // console.log(`Deploying contracts with the account ${deployerAddr} and balance: ${balance}`);


    const expectedTokenManagerContractAddress = ethers.getCreateAddress({
        from: deployerAddr,
        // +3 as current nonce +2 (sum +3) is for `FeesManager` deployment and +1 is for `TokenFactory` deployment
        nonce: (await deployer.getNonce()) + 5,
    });


    // console.log(`Expected token Manager:1`, expectedTokenManagerContractAddress);
    // Deploy `authorizationGuard`
    const authorizationGuard = await trackDeployment(
        () => deployment.deployAuthorizationGuard(deployer, {
            adminAddresses,
            authorizedAccounts: authorizedAdmins,
            trustedContracts: [expectedTokenManagerContractAddress]
        }),
        `AuthorizationGuard`,
    );

    // console.log(`AuthorizationGuard deployed at ${authorizationGuard.target}`);

    // Deploy Multi Signature Validation contract
    const multiSigValidation = await trackDeployment(
        () => deployment.deployMultiSigValidation(deployer, {
            authorizationGuard: authorizationGuard.target,
            multiSigSigners: multiSigSigners,
            mintSigners: mintSigners,
            releaseSigners: releaseSigners
        }),
        `MultiSigValidation`
    )

    // console.log(`MultiSigValidation deployed at ${multiSigValidation.target}`);


    // Deploy `MetalToken` beacon
    const metalTokenBeacon = await trackDeployment(
        () => deployment.deployMetalTokenBeacon(deployer),
        `MetalToken`,
    );

    // console.log(`MetalToken Beacon proxy deployed at ${metalTokenBeacon.target}`);


    // Deploy `FeesManager` proxy
    const expectedTokenManagerAddress = ethers.getCreateAddress({
        from: deployerAddr,
        // +3 as current nonce +2 (sum +3) is for `FeesManager` deployment and +1 is for `TokenFactory` deployment
        nonce: (await deployer.getNonce()) + 2,
    });



    // console.log(`Actual TokenManager address:`, expectedTokenManagerAddress)
    const feeRate = getFeeRate();
    const feeWallet = getFeeWallet();
    const feesManagerProxy = await trackDeployment(
        () =>
            deployment.deployFeesManager(deployer, {
                feeWallet: feeWallet,
                txFeeRate: feeRate,
                minTxFee: 0n,
                maxTxFee: ethers.MaxUint256,
                zeroFeeAccounts: [feeWallet, expectedTokenManagerAddress],
                authorizationGuard: authorizationGuard.target
            }),
        `FeesManager`,
    );

    // console.log(`FeesManager deployed at ${feesManagerProxy.target}`);


    // Deploy `TokenFactory` contract
    const tokensMetadata = getTokensMetadata(deployerAddr, feesManagerProxy.target, authorizationGuard.target);
    const tokenFactory = await trackDeployment(
        () =>
            deployment.deployTokenFactory(deployer, {
                owner: deployerAddr,
                tokenBeacon: metalTokenBeacon.target,
                initTokens: tokensMetadata,
            }),
        `TokenFactory`,
    );

    // console.log(`TokenFactory deployed at ${tokenFactory.target}`);

    // Deploy `TokenManager` contract
    const tokenManager = await trackDeployment(
        () =>
            deployment.deployTokenManager(deployer, {
                tokenFactory: tokenFactory.target,
                feesManager: feesManagerProxy.target,
                adminAddresses: adminAddresses,
                authorizedAddresses: authorizedAdmins,
                multiSigValidationAddress: multiSigValidation.target,
                authorizedGuardAddress: authorizationGuard.target
            }),
        `TokenManager`,
    );

    // console.log(`TokenManager deployed at ${tokenManager.target}`);

    const isTrusted = await authorizationGuard.isTrustedContract(tokenManager.target);
    if (isTrusted) {
        // console.log(`Token manager is trusted?.`, isTrusted)
    }

    // In case of testnet deployment, verify the proxy and beacon contracts on Tenderly
    if (testnetDeployment) {
        await tenderly.verify({
            name: `FeesManager`,
            address: await getImplementationAddress(
                ethers.provider,
                feesManagerProxy.target.toString(),
            ),
        });

        await tenderly.verify({
            name: `MetalToken`,
            address: await upgrades.beacon.getImplementationAddress(
                metalTokenBeacon.target.toString(),
            ),
        });

    }

    // Must be retrieved like this as these are beacon proxies created during the deployment of `TokenFactory`
    const goldToken = await ethers.getContractAt(
        `MetalToken`,
        await tokenFactory.tokenForId(TokenIdentifier.Gold),
    );
    console.log(`Gold MetalToken deployed at ${goldToken.target}`);


    const silverToken = await ethers.getContractAt(
        `MetalToken`,
        await tokenFactory.tokenForId(TokenIdentifier.Silver),
    );


    const chainId = (await ethers.provider.getNetwork()).chainId;
    // Write the deployment results for metal token beacon proxies as they are already deployed via `TokenFactory`
    updateDeploymentsJson(`GoldToken`, goldToken.target, chainId);
    updateDeploymentsJson(`SilverToken`, silverToken.target, chainId);

};
