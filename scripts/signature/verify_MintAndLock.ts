import { deployer, signMessages } from "./generateSignedMessage";
import TokenManagerAbi from "../../artifacts/contracts/management/TokenManager.sol/TokenManager.json";
import { deployments } from "../../deployments.json";
import { ethers } from "hardhat";
import { CommonOpMessage } from "./signature_interfaces";

// Setup TokenManager address and Signature contract address
const tokenManagerAddress = "0x0Dc069eFe29C1a7E7786CBEc12080dd6F33168D5";
const signatureContractAddress = "0x85b635cA25D7F3Be78De12a3d7a5588D243a9877"

// Define message to sign for gold token minting
const message_GoldToken: CommonOpMessage = {
    account: "0xE4e89e2344AbB8CC49D20E826A8f6A10e5fd2867",
    weight: 99990,
    metalId: 0,
    documentHash: "0x16e7daf19653063669804925fd701b85c1eda3f5a13dea452adad16024ca64cd",
    signatureHash: "",
    signatures: [
        "",
        "",
        ""
    ],
    roleIndices: []
}

// Define message to sign for gold token minting
const message_GoldToken2: CommonOpMessage = {
    account: tokenManagerAddress,
    weight: 500,
    metalId: 0,
    documentHash: "0xa456a0908d22788f7fb930a319c562b1bd29865184c45a52fa0a55a6ebf27278",
    signatureHash: "",
    signatures: [
        "",
        "",
        ""
    ],
    roleIndices: []
}

// Define message to sign for silver token minting
const message_SilverToken: CommonOpMessage = {
    account: tokenManagerAddress,
    weight: 5000,
    metalId: 1,
    documentHash: "0xa656a0908d22788f7fb930a319c562b1bd29865184c45a52fa0a55a6ebf27278",
    signatureHash: "",
    signatures: [
        "",
        "",
        ""
    ],
    roleIndices: []
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
        const commonOpMessages = [];
        for (let message of messages) {
            const { messageHash, signatures } = await signMessages("mintAndLockTokens", message, signatureContractAddress);
            console.log(`Signatures: `, signatures);
            console.log(`messageHash: `, messageHash);

            const commonOpMessage: CommonOpMessage = {
                account: message.account,
                weight: message.weight,
                metalId: message.metalId,
                documentHash: message.documentHash,
                signatureHash: messageHash ? messageHash : "",
                signatures: signatures,
                roleIndices: roleIndices
            }

            commonOpMessages.push(commonOpMessage)
        }

        const tokenManagerContract = new ethers.Contract(tokenManagerAddress, TokenManagerAbi.abi, authorizedWallet);

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