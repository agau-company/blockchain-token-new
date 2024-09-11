import { deployer, signMessages } from "./generateSignedMessage";
import TokenManagerAbi from "../../artifacts/contracts/management/TokenManager.sol/TokenManager.json";
import { deployments } from "../../deployments.json";
import { ethers } from "hardhat";
import { CommonOpMessage } from "./signature_interfaces";
import signatureValidationArtifact from '../../artifacts/contracts/signature/SignatureValidation.sol/MultiSigValidation.json';
import { getContractFromDeployment } from "../helpers/deployed-contracts";

async function main() {

    try {
        const multisigValidationContr = await getContractFromDeployment('MultiSigValidation');

        const [deployer, backend, signer1, signer2, signer3, signer4, signer5, signer6] = await ethers.getSigners();
        const operationType = 0;
        const signers = [
            signer1.address,
            signer2.address,
            signer3.address,
            signer4.address,
            signer5.address,
        ]

        const contract = new ethers.Contract(multisigValidationContr.address, signatureValidationArtifact.abi, ethers.provider) as any;
        console.log(`Deployer add:`, deployer.address)

        for (let signer of signers) {
            const role = await contract.connect(deployer).getRole(operationType, signer)
            console.log(`Role for ${signer}:`, role);

        }

        const requiredSigs = await contract.connect(deployer).requiredSignatures(operationType);
        const requiredSigsOp1 = await contract.connect(deployer).requiredSignatures(operationType + 1);
        console.log(`Required signatures for operation type ${operationType}: `, requiredSigs)
        console.log(`Required signatures for operation type ${operationType + 1}: `, requiredSigsOp1)

        return true;

    } catch (error) {
        console.error(`Error while trying to get signers.`, error)
        return false
    }
}

main().catch((e) => {
    console.error(`Caught error:`, e);
})