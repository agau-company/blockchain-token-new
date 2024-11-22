// import { TokenFactory } from "../../../types";
import { AddressLike } from "ethers";
import { TokenInitParamStruct } from "../../helpers/deploy";

export enum TokenIdentifier {
    Gold = 0,
    Silver = 1,
}

export const getTokensMetadata = (
    owner: AddressLike,
    feesManager: AddressLike,
    authorizationGuardAddress: AddressLike
): TokenInitParamStruct[] => {
    return [
        {
            tokenId: TokenIdentifier.Gold,
            owner: owner,
            feesManager: feesManager,
            name: `AgAu Gold`,
            symbol: `AGOLD`,
            authorizationGuard: authorizationGuardAddress
        },
        {
            tokenId: TokenIdentifier.Silver,
            owner: owner,
            feesManager: feesManager,
            name: `AgAu Silver`,
            symbol: `ASLVR`,
            authorizationGuard: authorizationGuardAddress
        },
    ];
};


export const getTokensMetadataVerification = (
    owner: AddressLike,
    feesManager: AddressLike,
    authorizationGuardAddress: AddressLike
): any[] => {
    return [
        [
            owner,
            feesManager,
            TokenIdentifier.Gold,
            `AgAu Gold`,
            `AGOLD`,
            authorizationGuardAddress
        ],
        [
            owner,
            feesManager,
            TokenIdentifier.Silver,
            `AgAu Silver`,
            `ASLVR`,
            authorizationGuardAddress
        ],
    ];
};
