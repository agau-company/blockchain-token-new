import { ethers, run } from "hardhat";
import { OpType } from "../src/full-deploy";

//npx hardhat run scripts/verify/verify-multisigvalidation.ts --network sepolia
export async function main(contractAddress: string, authorizationGuardAddress: string) {

    const [deployer, backendWallet, signer1, signer2, signer3, signer4] = await ethers.getSigners();


    try {
        console.log(`verify multisig:`, {
            authorizationGuardAddress,
        })
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: [
                authorizationGuardAddress,
            ],
        });
        console.log("Contract verified successfully");
        return true;
    } catch (error) {
        console.error("Verification failed:", error);
        return false;
    }
}
