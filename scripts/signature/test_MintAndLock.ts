import { deployer, signMessages } from "./generateSignedMessage";
import TokenManagerAbi from "../../artifacts/contracts/management/TokenManager.sol/TokenManager.json";
import { deployments } from "../../deployments.json";
import { ethers } from "hardhat";
import { CommonOpMessage } from "./signature_interfaces";
import { getContractFromDeployment } from "../helpers/deployed-contracts";

// Setup TokenManager address and Signature contract address
// const tokenManagerAddress = "0x8A2277457d464fa9ADe3866886274C11CbB9b89C";
// const signatureContractAddress = "0xe37BF7C464aD5262aEd364DCd621531f2A34e0Ef"

// Define message to sign for gold token minting
const message_GoldToken: CommonOpMessage = {
    account: "0xE4e89e2344AbB8CC49D20E826A8f6A10e5fd2867",
    weight: 10000,
    metalId: 0,
    documentHash: "0x2ae7daf19653063662804925fd701b85c1e4a3f5a13dea452adad16024ca64ca",
    signatureHash: "",
    signatures: [
        "",
        "",
        ""
    ],
}

// Define message to sign for gold token minting
const message_GoldToken2: CommonOpMessage = {
    account: "0xE4e89e2344AbB8CC49D20E826A8f6A10e5fd2867",
    weight: 500,
    metalId: 0,
    documentHash: "0xa856a0908d22788f7fb930a319c562b1bd29865184c45a52fa0a55a6ebf27278",
    signatureHash: "",
    signatures: [
        "",
        "",
        ""
    ],
}

// Define message to sign for silver token minting
const message_SilverToken: CommonOpMessage = {
    account: "0xE4e89e2344AbB8CC49D20E826A8f6A10e5fd2867",
    weight: 5000,
    metalId: 1,
    documentHash: "0xa956a0908d22788f7fb930a319c562b1bd29865184c45a52fa0a55a6ebf27278",
    signatureHash: "",
    signatures: [
        "",
        "",
        ""
    ],
}

// Set the index of the manager's role in the MultiSig Contract
const roleIndices = [0, 1, 2, 3];

// Messages to sign
const messages = [
    message_GoldToken,
    // message_GoldToken2,
    // message_SilverToken
]


async function main() {

    const authorizedWallet = deployer;
    try {
        const tokenManager = await getContractFromDeployment('TokenManager');
        const signatureContract = await getContractFromDeployment('MultiSigValidation');
        const commonOpMessages = [];
        for (let message of messages) {
            const response = await signMessages("mintAndLockTokens", message, signatureContract.address);
            if (!response) {
                throw new Error("Failed to sign messages.");
            }

            const { messageHash, signatures } = response;
            console.log(`Signatures: `, signatures);
            console.log(`messageHash: `, messageHash);

            const commonOpMessage: CommonOpMessage = {
                account: message.account,
                weight: message.weight,
                metalId: message.metalId,
                documentHash: message.documentHash,
                signatureHash: messageHash ? messageHash : "",
                signatures: signatures,
            }

            commonOpMessages.push(commonOpMessage)
        }

        const tokenManagerContract = new ethers.Contract(tokenManager.address, TokenManagerAbi.abi, authorizedWallet);

        console.log(`Trying to mint tokens and lock them....`, commonOpMessages)
        const mintTokensTx = await tokenManagerContract.mintAndLockTokens(commonOpMessages)
        const mintTokensReceipt = await mintTokensTx.wait();
        console.log(`Mint Tokens receipt:`, mintTokensReceipt);

        console.log(`Mint Tokens confirmed.`)
        return true;

    } catch (error) {
        console.error(`Error while trying to mint and lock tokens...`, error)
        return false
    }
}

main().catch((e) => {
    console.error(`Caught error:`, e);
})