import { ethers, run } from "hardhat";
import { OpType } from "../src/full-deploy";

//npx hardhat run scripts/verify/verify-multisigvalidation.ts --network sepolia
export async function main(contractAddress: string, authorizationGuardAddress: string) {

    const [deployer, backendWallet, signer1, signer2, signer3, signer4] = await ethers.getSigners();

    const mintSigners = [
        { signerAddress: signer1.address, roleName: "Warehouse admin", operationType: OpType.MINT_OP },
        { signerAddress: signer2.address, roleName: "Director", operationType: OpType.MINT_OP },
        { signerAddress: signer3.address, roleName: "Token manager", operationType: OpType.MINT_OP },
        { signerAddress: signer4.address, roleName: "Auditor", operationType: OpType.MINT_OP },
    ];

    const releaseSigners = [
        { signerAddress: signer4.address, roleName: "Auditor", operationType: OpType.RELEASE_OP },
    ];

    const multiSigSigners = [
        { signerAddress: signer1.address, roleName: "Signature Manager", operationType: OpType.ADMIN_OP },
    ];


    try {
        console.log(`verify multisig:`, {
            authorizationGuardAddress,
            mintSigners,
            releaseSigners,
            multiSigSigners,
        })
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: [
                authorizationGuardAddress,
                multiSigSigners,
                mintSigners,
                releaseSigners,
            ],
        });
        console.log("Contract verified successfully");
        return true;
    } catch (error) {
        console.error("Verification failed:", error);
        return false;
    }
}
