import { ethers } from "hardhat";
import signatureValidationArtifact from '../../artifacts/contracts/signature/SignatureValidation.sol/MultiSigValidation.json';
import * as deployment from "../../deployments.json";
import { NetworkNames, networks } from "../network-conf";
import { getContractFromDeployment } from "../helpers/deployed-contracts";


async function main() {

    const multisigValidationContr = await getContractFromDeployment('MultiSigValidation');

    try {
        const [deployer, backend, signer1, signer2, signer3, signer4, signer5, signer6] = await ethers.getSigners();
        const operationType = 0;

        const contract = new ethers.Contract(multisigValidationContr?.address, signatureValidationArtifact.abi, ethers.provider) as any;
        console.log(`Deployer add:`, deployer.address)
        console.log(`MultiSig contract:`, multisigValidationContr.address)


        const requiredSigs = await contract.connect(deployer).requiredSignatures(operationType);
        const requiredSigsOp1 = await contract.connect(deployer).requiredSignatures(operationType + 1);
        console.log(`Required signatures for operation type ${operationType}: `, requiredSigs)
        console.log(`Required signatures for operation type ${operationType + 1}: `, requiredSigsOp1)

        const op0Signers = await contract.connect(deployer).getSignerRegistry(0);
        const op1Signers = await contract.connect(deployer).getSignerRegistry(1);

        console.log(`Operation 0 signers:`, op0Signers);
        console.log(`Operation 1 signers:`, op1Signers);

        const op0SignersValidated = op0Signers.map((_address: string) => false);
        const op1SignersValidated = op1Signers.map((_address: string) => false);

        let invalid = [];
        console.log(`Verifying op0 signers...`)
        for (let i = 0; i < op0Signers.length; i++) {
            const isSigner = await contract.connect(deployer).isSigner(op0Signers[i], 0);
            if (isSigner) {
                op0SignersValidated[i] = true;
            }
            else {
                invalid.push({ operationType: 0, signer: op0Signers[i] })
            }
        }

        console.log(`Verifying op1 signers...`)
        for (let j = 0; j < op1Signers.length; j++) {
            const isSigner = await contract.connect(deployer).isSigner(op1Signers[j], 1);
            if (isSigner) {
                op1SignersValidated[j] = true;
            }
            else {
                invalid.push({ operationType: 1, signer: op1Signers[j] })
            }
        }

        let isValidSignersOp0 = true;
        for (let isValid of op0SignersValidated) {
            if (!isValid) {
                isValidSignersOp0 = false;
                break;
            }
        }

        let isValidSignersOp1 = true;
        for (let isValid of op1SignersValidated) {
            if (!isValid) {
                isValidSignersOp1 = false;
                break;
            }
        }

        if (isValidSignersOp0 && isValidSignersOp1) {
            console.log(`All signers are OK!`)
        }
        else {
            console.log(`Detected invalid signer(s):`, invalid)
            if (!isValidSignersOp0) {
                console.log(`Something wrong with signers for operation 0: `, op0SignersValidated)

            }
            if (!isValidSignersOp1) {
                console.log(`Something wrong with signers for operation 1: `, op1SignersValidated)

            }

        }
        return true;

    } catch (error) {
        console.error(`Error while trying to get signers.`, error)
        return false
    }
}

main().catch((e) => {
    console.error(`Caught error:`, e);
})