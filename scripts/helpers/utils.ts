import { ethers, network, run } from "hardhat";
import { AddressLike } from "ethers";
import { keyInYNStrict } from "readline-sync";
import { chainIds, explorerUrl, UrlType } from "../../hardhat.config";
import { Deployment, DeploymentContract, Deployments } from "./types";
import { Contract, BaseContract, ContractTransactionResponse } from "ethers";

import * as fs from "fs";
import * as path from "path";

// --- Transaction helpers ---

export async function trackTransaction(
    tx: Promise<ContractTransactionResponse>,
    name: string,
): Promise<void> {
    console.log(`Executing the transaction with name '${name}' ...`);
    for (; ;) {
        try {
            const response = await tx;
            await response.wait();
            const net = await ethers.provider.getNetwork();
            console.log(
                `Transaction '${name}' executed: ${explorerUrl(
                    net.chainId,
                    UrlType.TX,
                    response.hash,
                )}`,
            );
            return;
        } catch (e) {
            console.log(`Failed to execute transaction '${name}', error: ${e}`);
            if (askYesNo(`Retry?`) == false) {
                throw `Deployment failed`;
            }
        }
    }
}

// --- Deployment helpers ---

// eslint-disable-next-line @typescript-eslint/no-var-requires, node/no-unpublished-require
let deployments: Deployments = require(`../../deployments.json`);

export async function deployWait<T extends BaseContract>(contractPromise: Promise<T>): Promise<T> {
    const contract = await contractPromise;
    const deployedContract = await contract.waitForDeployment();
    return deployedContract;
}

export async function trackDeployment<T extends BaseContract>(
    fn: () => Promise<T>,
    name: string = `Contract`,
): Promise<T> {
    for (; ;) {
        try {
            console.log(`Deploying ${name} ...`);

            const contract = await fn();

            const net = await ethers.provider.getNetwork();

            const deploymentTransaction = contract.deploymentTransaction();

            console.log(
                `${name} address: ${explorerUrl(
                    net.chainId,
                    UrlType.ADDRESS,
                    contract.target.toString(),
                )}`,
            );

            // Its possible for `deploymentTransaction` to be undefined in case contract is deployed using openzeppelin's upgrades
            if (deploymentTransaction) {
                console.log(
                    `${name} transaction: ${explorerUrl(
                        net.chainId,
                        UrlType.TX,
                        deploymentTransaction.hash,
                    )}`,
                );
                if (deploymentTransaction.gasPrice) {
                    console.log(`Gas price: ${deploymentTransaction.gasPrice.toString()} wei`);
                }
            } else {
                console.log(`Contract deployment output does not contain deployment transaction`);
            }
            console.log(`\n`);

            updateDeploymentsJson(name, contract.target, net.chainId);

            return contract;
        } catch (e) {
            console.log(`Failed to deploy ${name} contract, error: ${e}`, e);
            if (askYesNo(`Retry?`) == false) {
                throw `Deployment failed`;
            }
        }
    }
}

export async function trackDeploymentNoLogs<T extends BaseContract>(
    fn: () => Promise<T>,
    name: string = `Contract`,
): Promise<T> {
    for (; ;) {
        try {
            const contract = await fn();

            const net = await ethers.provider.getNetwork();

            const deploymentTransaction = contract.deploymentTransaction();

            updateDeploymentsJson(name, contract.target, net.chainId);

            return contract;
        } catch (e) {
            console.log(`Failed to deploy ${name} contract, error: ${e}`, e);
            if (askYesNo(`Retry?`) == false) {
                throw `Deployment failed`;
            }
        }
    }
}

export function updateDeploymentsJson(
    contractName: string,
    contractAddr: AddressLike,
    chainId: bigint,
): void {
    deployments = rewriteDeploymentJson(contractName, contractAddr, chainId);
    fs.writeFileSync(
        path.join(__dirname, `../..`, `deployments.json`),
        JSON.stringify(deployments, null, 4),
    );
}


function rewriteDeploymentJson(
    contractName: string,
    contractAddr: AddressLike,
    chainId: bigint,
): Deployments {
    const networks = deployments.deployments;
    const networkName = (Object.keys(chainIds) as (keyof typeof chainIds)[]).find(key => {
        return chainIds[key] === chainId;
    });

    if (networkName === undefined) {
        throw `Unsupported chainId ${chainId}`;
    }
    for (let i = 0; i < networks.length; i++) {
        if (networks[i].network === networkName) {
            for (let j = 0; j < networks[i].contracts.length; j++) {
                const currContractName = networks[i].contracts[j].name;
                if (currContractName === contractName) {
                    deployments.deployments[i].contracts[j].address = contractAddr.toString();
                    return deployments;
                }
            }
            // The network already exists but an entry for the desired contract does not, so create one:
            const depl: DeploymentContract = {
                name: contractName,
                address: contractAddr.toString(),
            };
            deployments.deployments[i].contracts.push(depl);
            return deployments;
        }
    }

    // Get the index of the new deployment.
    const index = binarySearchByNetwork(deployments, networkName);
    const newContract: DeploymentContract = {
        name: contractName,
        address: contractAddr.toString(),
    };
    const newDeployment: Deployment = {
        network: networkName,
        contracts: [newContract],
    };

    // Place the new entry in alphabetical order based on network name.
    deployments.deployments.splice(index, 0, newDeployment);
    return deployments;
}

export async function getContract(name: string): Promise<Contract> {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const address = getContractAddress(chainId, name);
    return await ethers.getContractAt(name, address);
}

export function getContractAddress(chainId: bigint, name: string): string {
    const networkName = (Object.keys(chainIds) as (keyof typeof chainIds)[]).find(key => {
        return chainIds[key] === chainId;
    });

    if (networkName === undefined) {
        throw `Unsupported chainId ${chainId}`;
    }

    const deployment: Deployment | undefined = deployments.deployments.find(
        (d: { network: string }) => d.network === networkName,
    );

    if (deployment === undefined) {
        throw `No deployment found for network ${network}`;
    }

    const contract: DeploymentContract | undefined = deployment.contracts.find(
        (c: { name: string }) => c.name === name,
    );

    if (contract === undefined) {
        throw `No contract found for name ${name}`;
    }

    return contract.address;
}

// Performs a binary search by the network name (e.g., goerli) to ensure the new
// deployment is placed in alphabetical order.
function binarySearchByNetwork(deployments: Deployments, networkName: string): number {
    let start = 0;
    let end = deployments.deployments.length - 1;
    while (start <= end) {
        // To prevent overflow.
        const mid = Math.floor(start + (end - start) / 2);
        if (mid == 0 && deployments.deployments[mid].network.localeCompare(networkName) > 0) {
            return mid;
        }
        if (
            deployments.deployments[mid].network.localeCompare(networkName) < 0 &&
            (mid + 1 > end ||
                deployments.deployments[mid + 1].network.localeCompare(networkName) > 0)
        ) {
            return mid + 1;
        }
        if (deployments.deployments[mid].network.localeCompare(networkName) < 0) {
            start = mid + 1;
        } else {
            end = mid - 1;
        }
    }
    return 0;
}

// ---- Contract verification helpers ----

export async function verifyContract(
    contractAddress: AddressLike,
    constructorParams: {
        [key: string]: string | bigint | object | string[] | object[];
    } = {},
): Promise<void> {
    console.log(`Verifying contract at address ${contractAddress} ...`);
    const constructorValues = Object.values(constructorParams);
    await run(`verify:verify`, {
        address: contractAddress.toString(),
        constructorArguments: constructorValues,
    });
}

// --- Input handling helpers ---

function askYesNo(query: string): boolean {
    return keyInYNStrict(query);
}
