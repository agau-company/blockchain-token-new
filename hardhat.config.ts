import "@nomiclabs/hardhat-solhint";
// import "hardhat-console";
import "hardhat-preprocessor";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";

import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names";
import { HardhatUserConfig, subtask } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";


import { resolve } from "path";
import * as toml from "toml";
import * as dotenv from "dotenv";
import * as tenderly from "@tenderly/hardhat-tenderly";
import fs from "fs";

import "./tasks/mintAndLockTokens";

// Automatically verify contracts on Tenderly after deployment
export const TENDERLY_AUTO_VERIFY: boolean =
    process.env.TENDERLY_AUTO_VERIFY == `TRUE` ? true : false;

// Enable contract verification after deployment
export const VERIFY_CONTRACTS: boolean = process.env.VERIFY_CONTRACTS == `TRUE` ? true : false;

const SOLC_DEFAULT: string = `0.8.22`;

// @audit BOGDAN Made it more versatile for the forks
export const chainIds = {
    hardhat: 31337n,
    sepolia: 11155111n,
    bsc: 97n,
    ethereum: 1n,
    tenderly: 17000n, // same as Holesky
};

tenderly.setup({
    automaticVerifications: TENDERLY_AUTO_VERIFY,
});

dotenv.config({ path: resolve(__dirname, `./.env`) });

function getChainConfig(chain: keyof typeof chainIds): NetworkUserConfig {
    let jsonRpcUrl: string | undefined;

    switch (chain) {
        case `bsc`:
            jsonRpcUrl = process.env.BSC_NODE_URL;
            break;
        case `sepolia`:
            jsonRpcUrl = process.env.SEPOLIA_NODE_URL;
            break;
        case `ethereum`:
            jsonRpcUrl = process.env.ETHEREUM_NODE_URL;
            break;
        case `tenderly`:
            jsonRpcUrl = process.env.TENDERLY_FORK_URL;
            break;
        default:
            throw new Error(`Unknown chain ${chain}`);
    }

    if (jsonRpcUrl === undefined || jsonRpcUrl === ``) {
        throw new Error(`Missing JSON RPC URL for ${chain}`);
    }

    return {
        accounts: {
            mnemonic: process.env.MNEMONIC,
            path: `m/44'/60'/0'/0`,
        },
        chainId: Number(chainIds[chain]),
        url: jsonRpcUrl,
    };
}

export enum UrlType {
    ADDRESS = `address`,
    TX = `tx`,
}

export function explorerUrl(chainId: bigint | undefined, type: UrlType, param: string): string {
    switch (chainId) {
        case chainIds.bsc:
            return `https://testnet.bscscan.com/${type}/${param}`;
        case chainIds.sepolia:
            return `https://sepolia.etherscan.io/${type}/${param}`;
        case chainIds.ethereum:
            return `https://etherscan.io/${type}/${param}}`;
        case chainIds.tenderly:
            return `Not available for Tenderly`;
        default:
            return `Unknown chainId ${chainId}`;
    }
}

// Try to use the Foundry config as a source of truth
let foundry;
try {
    foundry = toml.parse(fs.readFileSync(`./foundry.toml`).toString());
    foundry.profile.default.solc = foundry.profile.default[`solc-version`]
        ? foundry.profile.default[`solc-version`]
        : SOLC_DEFAULT;
} catch (error) {
    foundry = {
        profile: {
            default: {
                solc: SOLC_DEFAULT,
            },
        },
    };
}

// Read forge remappings from `remappings.txt`
function getRemappings(): string[][] {
    return fs
        .readFileSync(`remappings.txt`, `utf8`)
        .split(`\n`)
        .filter(Boolean) // remove empty lines
        .map(line => line.trim().split(`=`));
}

// Prune Forge style tests from hardhat paths
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_, __, runSuper) => {
    const paths = await runSuper();
    return paths.filter((p: string) => !p.endsWith(`.t.sol`));
});

// For full option list see: https://hardhat.org/config/
const config: HardhatUserConfig = {
    preprocess: {
        eachLine: _ => ({
            transform: (line: string): string => {
                for (const [from, to] of getRemappings()) {
                    if (line.includes(from)) {
                        line = line.replace(from, to);
                        break;
                    }
                }

                return line;
            },
        }),
    },
    paths: {
        artifacts: `./artifacts`,
        cache: `./hardhat-cache`,
        sources: `./contracts`,
        tests: `./tests/ts`,
    },
    defaultNetwork: `hardhat`,
    solidity: {
        version: foundry.profile?.default?.solc || SOLC_DEFAULT,
        settings: {
            optimizer: {
                // Disable the optimizer when debugging
                // https://hardhat.org/hardhat-network/#solidity-optimizer-support
                enabled: foundry.profile?.default?.optimizer || true,
                runs: foundry.profile?.default?.optimizer_runs || 200,
                details: {
                    yul: foundry.profile?.default?.optimizer_details?.yul || true,
                },
            },
            // If stack-too-deep error occurs, flip this on
            // otherwise leave off for faster builds
            viaIR: foundry.profile?.default?.via_ir || false,
        },
    },
    networks: {
        hardhat: {
            accounts: {
                mnemonic: process.env.MNEMONIC,
            },
            allowUnlimitedContractSize: true,
            chainId: Number(chainIds.hardhat),
        },
        sepolia: getChainConfig(`sepolia`),
        bsc: getChainConfig(`bsc`),
        ethereum: getChainConfig(`ethereum`),
        tenderly: getChainConfig(`tenderly`),
    },
    tenderly: {
        username: process.env.TENDERLY_USERNAME ?? ``,
        project: process.env.TENDERLY_PROJECT_NAME ?? ``,
        privateVerification: false,
    },
    etherscan: {
        apiKey: { sepolia: process.env.ETHERSCAN_API_KEY || "", bscTestnet: process.env.BSCSCAN_API_KEY || "" },
    },
    typechain: {
        target: `ethers-v6`,
        outDir: `types`,
    },
};



export default config;
