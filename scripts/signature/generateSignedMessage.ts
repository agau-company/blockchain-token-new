import { ethers } from "hardhat";
import signatureValidationArtifcat from "../../artifacts/contracts/signature/SignatureValidation.sol/MultiSigValidation.json";
import { CommonOpMessage } from "./signature_interfaces";
import { Wallet, Contract } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";


// Connect to the Ethereum provider
// const provider = ethers.getDefaultProvider('sepolia'); // or your preferred network

// Connect to the BSC provider
const provider = new ethers.JsonRpcProvider(process.env.BSC_NODE_URL);

// Parse the array of private keys from the environment variable
const privateKeys = process.env.PRIVATE_KEYS ? process.env.PRIVATE_KEYS.split(',') : [];
if (privateKeys.length === 0) {
    throw new Error("No private keys found in environment variables");
}

const wallets = privateKeys.map((key) => new ethers.Wallet(key, provider));

export const deployer = wallets[0];

const signers = wallets.map((wallet) => wallet);

async function retrieveMessageHash(functionName: string, message: CommonOpMessage, signatureContractAddress: string) {
    try {
        const signatureContract = new ethers.Contract(signatureContractAddress, signatureValidationArtifcat.abi, provider);

        const messageHash = await signatureContract.getMessageHashCommon(functionName,
            {
                account: message.account,
                weight: message.weight,
                metalId: message.metalId,
                documentHash: message.documentHash
            }
        );

        console.log(`Retrieved message hash from contract`, messageHash);
        return messageHash;
    } catch (error) {
        console.error(`Error: while retrieving message hash from contract`, error)
        return null;
    }
}


// Sign the message hash using `eth_personalSign`
async function signMessage(hash: string, wallet: any) {
    const signature = await wallet.signMessage(ethers.getBytes(hash));
    return signature;
}

// Generate and sign the prefixed hash
async function signPrefixedMessage(hash: string, wallet: any) {
    const prefixedMessage = ethers.solidityPackedKeccak256(
        ['string', 'bytes32'],
        ['\x19Ethereum Signed Message:\n32', hash]
    );
    const signature = await signMessage(prefixedMessage, wallet);
    return { signature, prefixedMessage }
}


// Start signing procedure
export async function signMessages(functionName: string, message: CommonOpMessage, signatureContractAddress: string) {
    const messageHash = await retrieveMessageHash(functionName, message, signatureContractAddress);

    const signatureContract = new ethers.Contract(signatureContractAddress, signatureValidationArtifcat.abi, provider);

    const op0Signers = await signatureContract.getSignerRegistry(0);
    const op1Signers = await signatureContract.getSignerRegistry(1);

    console.log(`op0Signers:`, op0Signers);
    console.log(`op1Signers:`, op1Signers);

    const [deployer, be, signer1, signer2, signer3, signer4, signer5, signer6, signer7] = await ethers.getSigners();

    const allConnectedWallets = [signer1, signer2, signer3, signer4, signer5, signer6, signer7];

    let signers: HardhatEthersSigner[] = [];
    if (functionName.includes('release')) {

        for (let signerAddress of op1Signers) {
            const wallet = allConnectedWallets.find((w) => w.address == signerAddress);
            if (!wallet) {
                console.log(`Could not set up signer wallets for signing message...`);
                return;
            }
            signers.push(wallet);
        }

    }
    else {
        for (let signerAddress of op0Signers) {
            const wallet = allConnectedWallets.find((w) => w.address == signerAddress);
            if (!wallet) {
                console.log(`Could not set up signer wallets for signing message...`);
                continue
            }
            signers.push(wallet);
        }

    }

    console.log(`Using signers:`, signers);
    const signatures = [];
    let _prefixedMessage;
    // for (let i = 2; i < 7; i++) {
    for (let signer of signers) {
        console.log(`[${functionName}]: Signing message by wallet ${signer.address}`)
        const { signature, prefixedMessage } = await signPrefixedMessage(messageHash, signer)

        _prefixedMessage = prefixedMessage;
        console.log(`User: ${signer.address}; signature: ${signature}`);
        signatures.push(signature);
    }

    return { messageHash: _prefixedMessage, signatures };

}


// Deprecated
// Create the message hash
function hashMessageMintAndLockTokens(account: string, weight: number, metalId: number, documentHash?: string
    // , nonce: number
) {
    const abiCoder = new ethers.AbiCoder();
    return ethers.solidityPackedKeccak256(
        // abiCoder.encode(
        ['string', 'address', 'uint256', 'uint8', 'string'],
        ['mintAndLockTokens', account, weight, metalId, documentHash]
    );
}
