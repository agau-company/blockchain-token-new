import { ethers, run } from "hardhat";
import { getTokensMetadata } from "../config/token/config";

export async function main(contractAddress: string, feesManagerAddress: string, authorizationGuardAddress: string, beaconAddress: string, deployerAddress: string) {
    const tokensMetadata = getTokensMetadata(deployerAddress, feesManagerAddress, authorizationGuardAddress);

    // Convert tokensMetadata to the format expected by the contract
    const formattedTokensMetadata = tokensMetadata.map(token => ({
        tokenId: token.tokenId,
        owner: deployerAddress,
        feesManager: feesManagerAddress,
        name: token.name,
        symbol: token.symbol,
        authorizationGuard: authorizationGuardAddress
    }));

    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: [
                deployerAddress,
                beaconAddress,
                formattedTokensMetadata
            ],
        });
        console.log("Contract verified successfully");
        return true;
    } catch (error) {
        console.error("Verification failed:", error);
        return false;
    }
}