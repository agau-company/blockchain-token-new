import { deployer, signMessages } from "./generateSignedMessage";
import TokenManagerAbi from "../../artifacts/contracts/management/TokenManager.sol/TokenManager.json";
import { deployments } from "../../deployments.json";
import { ethers } from "hardhat";
import { CommonOpMessage } from "./signature_interfaces";
import signatureValidationArtifact from '../../artifacts/contracts/signature/SignatureValidation.sol/MultiSigValidation.json';
import { NetworkNames, networks } from "../network-conf";
import * as deployment from "../../deployments.json";
import { getContractFromDeployment } from "../helpers/deployed-contracts";

// Setup TokenManager address and Signature contract address
const signatureContractAddress = "0xe37BF7C464aD5262aEd364DCd621531f2A34e0Ef"

async function main() {

    try {
        // const currentNet = await ethers.provider.getNetwork()
        // const networkName: NetworkNames = networks[currentNet.chainId.toString()];
        // const contractDeployment = deployment.deployments.find((deploymentConf) => deploymentConf.network === networkName);
        // if (!contractDeployment) throw new Error(`Failed to fetch contract deployment addresses`);

        // const multisigValidationContr = contractDeployment.contracts.find((contractObj) => contractObj.name === 'MultiSigValidation');
        // if (!multisigValidationContr) throw new Error(`Failed to fetch contract for multi signature.`);

        const multisigValidationContr = await getContractFromDeployment('MultiSigValidation');
        const [deployer, backend, signer1, signer2, signer3, signer4, signer5, signer6, signer7] = await ethers.getSigners();
        const newSigner = signer5.address;

        const contract = new ethers.Contract(multisigValidationContr.address, signatureValidationArtifact.abi, ethers.provider) as any;
        console.log(`Deploye add:`, deployer.address)

        const tx = await contract.connect(deployer).addSigners(
            [
                {
                    signerAddress: signer5.address,
                    roleName: "CEO",
                    operationType: 0
                },
                {
                    signerAddress: signer7.address,
                    roleName: "COO",
                    operationType: 0
                }
            ]
        )
        const receipt = await tx.wait();
        if (receipt && (receipt.hash || receipt.transactionHash)) {
            console.log(`Success. Receipt: `, receipt.hash)
        }

        const isSigner = await contract.connect(deployer).isSigner(newSigner, 0);
        console.log(`Wallet ${newSigner} is signer role?`, isSigner);

        return true;

    } catch (error) {
        console.error(`Error while trying to test add signers..`, error)
        return false
    }
}

main().catch((e) => {
    console.error(`Caught error:`, e);
})