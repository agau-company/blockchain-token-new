import { ethers, tenderly, upgrades } from "hardhat";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";

import * as deployment from "../../deployments.json";
import * as verifyMultiSig from "../../scripts/verify/verify-multisigvalidation";
import * as verifyAuthorizationGuard from "../../scripts/verify/verify-authorizationguard";
// import * as verifyMetalToken from "../../scripts/verify/verify-metaltoken";
import * as verifyMetalToken from "./verify-metalTok";
import * as verifyFeesManager from "../../scripts/verify/verify-feesmanager";
import * as verifyTokenFactory from "../../scripts/verify/verify-tokenfactory";
import * as verifyTokenManager from "../../scripts/verify/verify-tokenmanager";
import { getContractFromDeployment } from "../helpers/deployed-contracts";

type NetworkNames = 'bsc' | 'sepolia' | 'hardhat' | 'ethereum';

const verificationParams: { [key: string]: any } = {
    'AuthorizationGuard': { func: verifyAuthorizationGuard.main, isProxy: false },
    'MultiSigValidation': { func: verifyMultiSig.main, isProxy: false },
    'MetalToken': { func: verifyMetalToken.main, isProxy: true },
    'FeesManager': { func: verifyFeesManager.main, isProxy: true },
    'TokenFactory': { func: verifyTokenFactory.main, isProxy: true },
    'TokenManager': { func: verifyTokenManager.main, isProxy: true },
    'GoldToken': { func: verifyMetalToken.main, isProxy: true },
    'SilverToken': { func: verifyMetalToken.main, isProxy: true },
}
const networks: { [chainId: string]: NetworkNames } = {
    '11155111': 'sepolia',
    '1': 'ethereum',
    '97': 'bsc',
}

export const verifyAllContracts = async () => {
    try {
        /** Inputs */
        // Select network
        const currentNet = await ethers.provider.getNetwork()
        const networkName: NetworkNames = networks[currentNet.chainId.toString()];

        console.log(`>Verifying on ${networkName}.`)

        let deployer;
        [deployer] = await ethers.getSigners();
        const deployerAddress = deployer.address
        console.log(`Deployer address:`, deployerAddress)
        /**End Inputs */

        // Retrieve contract addresses from deployment json file
        const contractDeployment = deployment.deployments.find((deploymentConf) => deploymentConf.network === networkName);

        if (!contractDeployment) throw new Error(`Failed to fetch contract deployment addresses`);
        console.log(`Retrieved contracts for ${networkName}`, contractDeployment);
        for (let contract of contractDeployment?.contracts) {

            // Verification functions defined above for each contract
            let verify = verificationParams[contract.name].func;

            const authorizationGuardContr = await getContractFromDeployment('AuthorizationGuard');
            const feesManagerContr = await getContractFromDeployment('FeesManager');
            const tokenManager = await getContractFromDeployment('TokenManager');
            const multisigValidationContr = await getContractFromDeployment('MultiSigValidation');
            const metalToken = await getContractFromDeployment('MetalToken');
            const tokenFactory = await getContractFromDeployment('TokenFactory');
            const metalBeaconToken = await getContractFromDeployment('MetalToken');

            console.log(`************** Starting verification for ${contract.name}**************`)

            switch (contract.name) {
                case 'AuthorizationGuard':
                    await verify(contract.address, tokenManager?.address);
                    break;
                case 'MultiSigValidation':
                    await verify(contract.address, authorizationGuardContr?.address);
                    break;

                case 'TokenManager':
                    await verify(contract.address, tokenFactory?.address, feesManagerContr?.address, multisigValidationContr?.address, authorizationGuardContr?.address);
                    break;

                case 'TokenFactory':
                    await verify(contract.address, feesManagerContr?.address, authorizationGuardContr?.address, metalBeaconToken?.address, deployerAddress);
                    break;

                case 'MetalToken':
                    await verify(tokenFactory?.address, deployerAddress, feesManagerContr?.address, authorizationGuardContr?.address, deployerAddress);
                    break;

                case 'GoldToken':
                    console.log(`GoldToken is verified by MetalToken case.`)
                    break;

                case 'SilverToken':
                    console.log(`SilverToken is verified by MetalToken case.`)
                    break;

                default:
                    await verify(contract.address);
                    break;
            }

            console.log(`Verified! ${contract.name} ${contract.address}`);
        }

    } catch (error) {
        console.error(`Verify-All: error`, error);
    }
}


verifyAllContracts()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });