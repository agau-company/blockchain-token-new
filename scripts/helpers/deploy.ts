import { VERIFY_CONTRACTS } from "./../../hardhat.config";


import { deployWait, verifyContract, verifyContractSpecial } from "./utils";
import { upgrades, ethers } from "hardhat";
import { Contract, Signer, AddressLike, BaseContract, BigNumberish } from "ethers";
import { SignerEntityStruct } from "../signature/signature_interfaces";

// --- Helper functions for deploying contracts ---

export interface CallGuardConstructorArgs {
    owner: AddressLike;
    [key: string]: AddressLike | string[];
}

export interface BridgeMediatorConstructorArgs extends CallGuardConstructorArgs {
    AMBContract: AddressLike;
    foreignMediator: AddressLike;
    [key: string]: AddressLike | string[];
}

export async function deployBridgeMediator(
    wallet: Signer,
    constructorArgs: BridgeMediatorConstructorArgs,
): Promise<any> {
    const bridgeMediatorName = `BridgeMediator`;
    const bridgeMediator = await ethers.getContractFactory(bridgeMediatorName, wallet);
    const bridgeMediatorContract = await deployWait(
        bridgeMediator.deploy(
            constructorArgs.AMBContract,
            constructorArgs.foreignMediator,
            constructorArgs.owner,
        ),
    );

    await onSuccessfulContractDeployment(
        bridgeMediatorName,
        bridgeMediatorContract.target,
        constructorArgs,
    );

    return bridgeMediatorContract;
}

export interface TokenInitParamStruct {
    tokenId: number;
    owner: AddressLike;
    feesManager: AddressLike;
    name: string;
    symbol: string;
    authorizationGuard: AddressLike;
}

export interface TokenFactoryConstructorArgs {
    owner: AddressLike;
    tokenBeacon: AddressLike;
    initTokens: TokenInitParamStruct[];
    [key: string]: AddressLike | object[];
}

export async function deployTokenFactory(
    wallet: Signer,
    constructorArgs: TokenFactoryConstructorArgs,
): Promise<any> {
    const tokenFactoryName = `TokenFactory`;
    const tokenFactory = await ethers.getContractFactory(tokenFactoryName, wallet);
    const tokenFactoryContract = await deployWait(
        tokenFactory.deploy(
            constructorArgs.owner,
            constructorArgs.tokenBeacon,
            constructorArgs.initTokens,
        ),
    );

    await onSuccessfulContractDeployment(
        tokenFactoryName,
        tokenFactoryContract.target,
        constructorArgs,
    );

    return tokenFactoryContract;
}

export interface TokenManagerConstructorArgs {
    tokenFactory: AddressLike;
    feesManager: AddressLike;
    adminAddresses: AddressLike[];
    authorizedAddresses: AddressLike[];
    multiSigValidationAddress: AddressLike;
    authorizedGuardAddress: AddressLike;
    [key: string]: AddressLike[] | AddressLike;
}

export async function deployTokenManager(
    wallet: Signer,
    constructorArgs: TokenManagerConstructorArgs,
): Promise<any> {
    const tokenManagerName = `TokenManager`;
    const tokenManager = await ethers.getContractFactory(tokenManagerName, wallet);
    const tokenManagerContract = await deployWait(
        tokenManager.deploy(
            constructorArgs.tokenFactory,
            constructorArgs.feesManager,
            constructorArgs.adminAddresses,
            constructorArgs.authorizedAddresses,
            constructorArgs.multiSigValidationAddress,
            constructorArgs.authorizedGuardAddress,
        ),
    );

    await onSuccessfulContractDeployment(
        tokenManagerName,
        tokenManagerContract.target,
        constructorArgs,
    );

    return tokenManagerContract;
}

export interface FeesManagerConstructorArgs {
    feeWallet: AddressLike;
    txFeeRate: bigint;
    minTxFee: bigint;
    maxTxFee: bigint;
    zeroFeeAccounts: AddressLike[];
    authorizationGuard: AddressLike;
    [key: string]: AddressLike | bigint | AddressLike[];
}

export async function deployFeesManager(
    wallet: Signer,
    constructorArgs: FeesManagerConstructorArgs,
): Promise<Contract> {
    const feesManagerName = `FeesManager`;
    const typedFeesManager = await ethers.getContractFactory(feesManagerName);
    const feesManager = new ethers.ContractFactory(
        typedFeesManager.interface,
        typedFeesManager.bytecode,
        wallet,
    );

    const feeManagerProxy = await deployWait(
        upgrades.deployProxy(feesManager, [
            constructorArgs.feeWallet,
            constructorArgs.txFeeRate,
            constructorArgs.minTxFee,
            constructorArgs.maxTxFee,
            constructorArgs.zeroFeeAccounts,
            constructorArgs.authorizationGuard
        ]),
    );

    // No on success callback is needed
    return feeManagerProxy;
}

export async function deployMetalTokenBeacon(wallet: Signer): Promise<Contract> {
    const metalTokenName = `MetalToken`;
    const typedMetalToken = await ethers.getContractFactory(metalTokenName);

    // Workaround as deployBeacon does not yet support typed contracts
    const metalToken = new ethers.ContractFactory(
        typedMetalToken.interface,
        typedMetalToken.bytecode,
        wallet,
    );

    const metalTokenBeacon = await deployWait(upgrades.deployBeacon(metalToken));
    // No on success callback is needed
    return metalTokenBeacon;
}

export async function prepareTokenBeaconUpgrade(wallet: Signer, metalToken: string): Promise<void> {
    const typedToken = await ethers.getContractFactory(`MetalToken`);
    const tokenImpl = new ethers.ContractFactory(typedToken.interface, typedToken.bytecode, wallet);

    await upgrades.prepareUpgrade(metalToken, tokenImpl);
}

export async function upgradeTokenBeacon(wallet: Signer, metalToken: string): Promise<Contract> {
    const metalTokenName = `MetalToken`;
    const typedToken = await ethers.getContractFactory(metalTokenName);
    const tokenImpl = new ethers.ContractFactory(typedToken.interface, typedToken.bytecode, wallet);

    const deployment = await upgrades.upgradeBeacon(metalToken, tokenImpl);
    const tokenContract = await deployment.waitForDeployment();

    await onSuccessfulContractDeployment(metalTokenName, tokenContract.target, {});

    return tokenContract;
}

async function onSuccessfulContractDeployment(
    contractName: string,
    contractAddress: AddressLike,
    constructorArgs: {
        [key: string]: string | bigint | object | string[] | object[];
    } = {},
): Promise<void> {
    if (contractName === `TokenFactory` && VERIFY_CONTRACTS) {
        await verifyContractSpecial(contractAddress, constructorArgs);
    }
    if (VERIFY_CONTRACTS) await verifyContract(contractAddress, constructorArgs);
}


// --- Helper functions for deploying contracts ---

export interface AuthorizationGuardConstructorArgs {
    adminAddresses: AddressLike[];
    authorizedAccounts: AddressLike[];
    trustedContracts: AddressLike[];
    [key: string]: AddressLike[];
}

export async function deployAuthorizationGuard(
    wallet: Signer,
    constructorArgs: AuthorizationGuardConstructorArgs,

): Promise<any> {
    const authorizationGuardName = `AuthorizationGuard`;
    const authorizationGuard = await ethers.getContractFactory(authorizationGuardName, wallet);
    const authorizationGuardContract = await deployWait(
        authorizationGuard.deploy(
            constructorArgs.adminAddresses,
            constructorArgs.authorizedAccounts,
            constructorArgs.trustedContracts
        ),
    );

    await onSuccessfulContractDeployment(
        authorizationGuardName,
        authorizationGuardContract.target,
        constructorArgs,
    );

    return authorizationGuardContract;
}

export interface MultiSigValidationConstructorArgs {
    authorizationGuard: AddressLike;
    [key: string]: SignerEntityStruct[] | AddressLike;

}

export async function deployMultiSigValidation(
    wallet: Signer,
    constructorArgs: MultiSigValidationConstructorArgs,
): Promise<BaseContract> {
    const multiSigValidationName = `MultiSigValidation`;
    const multiSigValidation = await ethers.getContractFactory(multiSigValidationName, wallet);

    const multiSigValidationContract = await deployWait(
        multiSigValidation.deploy(
            constructorArgs.authorizationGuard,
        ),
    );

    await onSuccessfulContractDeployment(
        multiSigValidationName,
        multiSigValidationContract.target,
        constructorArgs,
    );

    return multiSigValidationContract;
}
