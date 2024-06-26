### Mint and Lock Tokens

To mint and lock new Gold or Silver tokens, interact with the `mintAndLockTokens` function from the `TokenManager` contract.

Overview steps:
* Sign message with all necessary signer wallets
* Submit message and signatures to mintAndLockTokens function

Detailed steps:
FE Client:

1. **Get Message Hash** To retrieve the message hash, call the `getMessageHashCommon` from the `MultiSigValidation` contract. The message hash is used in step 3 (`signatureHash`)

* Function signature:
```
function getMessageHashCommon(string memory functionName, CommonTokenOpSignatureData memory message)
```

* Message content:

```
struct CommonTokenOpSignatureData {
    // Account address message is referred to
    address account;
    // Total amount of the metal (in grams)
    uint48 weight;
    // Metal identifier
    uint8 metalId;
    // Hash of the document to sign
    string documentHash;
}
```

e.g. 
```
getMessageHashCommon("mintAndLockTokens", {
    account: "TOKEN-RECEIVER-ADDRESS",
    weight: 1000,
    metalId: 0,
    documentHash: "DOCUMENT-HASH"
})
```

2. **Get Roles Array**: Call `getRoles()` from `MultiSigValidation` contract to retrieve the list of signers. Needed in step 3.


3. **Call Mint Function**: After signing, call the `mintAndLockTokens` function, you can pass an array of messages to mint several tokens in 1 transaction:

* Function Signature:
```
function mintAndLockTokens(CommonTokenOpMessageWithSignature[] calldata messages);
```

* Types:
```
struct CommonTokenOpMessageWithSignature {
    // Account address message is referred to
    address account;
    // Total amount of the metal (in grams)
    uint48 weight;
    // Metal identifier
    uint8 metalId;
    string documentHash;
    // Message Hash
    bytes32 signatureHash;
    // Submitted signatures
    bytes[] signatures;
    // Signer index in roles array
    uint256[] roleIndices;
}
```

e.g:
```
[
    {
        account: "TOKEN-RECEIVER-ADDRESS",
        weight: 1000,
        metalId: 0,
        documentHash: "0xa556a0908d22788f7fb930a319c562b1bd29865184c45a52fa0a55a6ebf27278",
        signatureHash: "0xe356a0908d22788f7fb930a319c562b1bd29865184c45a52fa0a55a6ebf27278",
        signatures: [
            "0xb096b0120bdfed604cab3f05fc091a282480fcbd282ad6068a5db2eda4f7d0fe51f9f91f193958cab7470e7ef3b88c5022db6344c58921ba74b30b6abd5d79051b",
            "0x31b1d3c34355bcbba6ee021c005d5c4073df91288aaa67caa555811f9825a5ae3b6b5b5a22d1e15baa58d01783077d053e200427753010ca38e8982eab8244451c",
            "0x0b0caac1453e1abb7b2a619b2b3d74f1b9ef63ef4ae6e33330f2d5ed8ef73984173b853d6b1703e24387baf89c15f7a0e1eb76f205121a59a45045b4c68974591c"
        ],
        roleIndices: [0,1,2] // Index of caller role
    }
]
```




Signers: [
    signer1: '0xCBA19FC71b5C474e6726D18e7Ab380aea7eA64fD',
    signer2: '0x56FcBC342D35ce908201407CA9cE6620BCcc4d9C',
    signer3: '0xC415B176F90C46EFe64dCB2608DF5394Aa36C49C',
    signer4: '0xff7774DC7FB785e41F5C0e04AF7db78897dC131f'
]