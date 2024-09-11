import { deployer, signMessages } from "./generateSignedMessage";
import TokenManagerAbi from "../../artifacts/contracts/management/TokenManager.sol/TokenManager.json";
import { deployments } from "../../deployments.json";
import { ethers } from "hardhat";
import { CommonOpMessage } from "./signature_interfaces";
import signatureValidationArtifact from '../../artifacts/contracts/signature/SignatureValidation.sol/MultiSigValidation.json';
import * as deployment from "../../deployments.json";
import { getContractFromDeployment } from "../helpers/deployed-contracts";


async function main() {

    try {
        const multisigValidationContr = await getContractFromDeployment('MultiSigValidation');

        const [deployer, backend, signer1, signer2, signer3, signer4, signer5, signer6] = await ethers.getSigners();

        const contract = new ethers.Contract(multisigValidationContr.address, signatureValidationArtifact.abi, ethers.provider) as any;

        const tx = await contract.connect(deployer).removeSigners(
            [
                {
                    signerAddress: signer5.address,
                    roleName: "CEO",
                    operationType: 0
                },
            ])
        const receipt = await tx.wait();
        console.log(`Transaction hash: `, receipt.hash)

        return true;

    } catch (error) {
        console.error(`Error while trying to test remove signers..`, error)
        return false
    }
}

main().catch((e) => {
    console.error(`Caught error:`, e);
})