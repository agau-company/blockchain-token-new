import { Contract, Signer, AddressLike, BaseContract, BigNumberish } from "ethers";

export interface CommonOpMessage {
    account: string;
    weight: number;
    // Metal identifier
    metalId: number;
    documentHash: string;
    // Message Hash
    signatureHash: string;
    // Submitted signatures
    signatures: string[];
    // Signer index in roles array
    // roleIndices: number[];
}

export interface SignerEntityStruct {
    signerAddress: AddressLike;
    roleName: string;
    operationType: number;
}