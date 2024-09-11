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
        const multisigValidationContr = await getContractFromDeployment('MultiSigValidation');
        const [deployer, backend, signer1, signer2, signer3, signer4, signer5, signer6, signer7] = await ethers.getSigners();
        const newSigner = signer5.address;

        const contract = new ethers.Contract(multisigValidationContr.address, signatureValidationArtifact.abi, ethers.provider) as any;

        const tx = await contract.connect(deployer).updateSigner(
            [
                {
                    currentSigner: signer4.address,
                    newSigner: signer6.address,
                    operationType: 0
                },
            ]
        )
        const receipt = await tx.wait();
        if (receipt && (receipt.hash || receipt.transactionHash)) {
            console.log(`Success. Transaction hash: `, receipt.hash)
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