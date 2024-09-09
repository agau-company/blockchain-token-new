import { ethers } from "hardhat";
import { NetworkNames, networks } from "../network-conf";
import * as deployment from "../../deployments.json";

export async function getContractFromDeployment(contractName: string) {
    const currentNet = await ethers.provider.getNetwork()
    const networkName: NetworkNames = networks[currentNet.chainId.toString()];
    const contractDeployment = deployment.deployments.find((deploymentConf) => deploymentConf.network === networkName);
    if (!contractDeployment) throw new Error(`Failed to fetch contract deployment addresses for network ${networkName}`);


    const targetContract = contractDeployment.contracts.find((contractObj) => contractObj.name === contractName);
    if (!targetContract) throw new Error(`Failed to fetch contract for ${contractName}.`);
    return targetContract;
}
