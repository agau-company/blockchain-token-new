import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
    AuthorizationGuard,
    FeesManager,
} from "../../../types";
import * as deployment from "../../../scripts/helpers/deploy";
import { trackDeploymentNoLogs } from "../../../scripts/helpers/utils";

enum GroupType {
    None = 0,
    TxFee = 1,
}

describe("FeesManager Access Control", function () {
    let authorizationGuard: AuthorizationGuard;
    let feesManager: FeesManager;
    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;

    beforeEach(async function () {
        [owner, admin, user1, user2, user3] = await ethers.getSigners();

        const admins = [owner.address];
        const authorized = [owner.address, admin.address];

        // Deploy AuthorizationGuard
        authorizationGuard = await trackDeploymentNoLogs(
            () => deployment.deployAuthorizationGuard(owner, {
                adminAddresses: admins,
                authorizedAccounts: authorized,
                trustedContracts: []
            }),
            `AuthorizationGuard`,
        );

        // Deploy FeesManager
        const feesManagerProxy = await trackDeploymentNoLogs(
            () => deployment.deployFeesManager(owner, {
                feeWallet: owner.address,
                txFeeRate: ethers.toBigInt(100), // 1%
                minTxFee: 0n,
                maxTxFee: ethers.MaxUint256,
                zeroFeeAccounts: [owner.address],
                authorizationGuard: authorizationGuard.target
            }),
            `FeesManager`,
        );

        feesManager = await ethers.getContractAt("FeesManager", feesManagerProxy.target);

        // Grant FEES_MANAGER_ROLE to owner and admin
        await authorizationGuard.grantRole(await authorizationGuard.FEES_MANAGER_ROLE(), owner.address);
        await authorizationGuard.grantRole(await authorizationGuard.FEES_MANAGER_ROLE(), admin.address);
    });

    describe("Admin Functions", function () {
        it("should allow admin to set a new fees wallet", async function () {
            const newFeesWallet = user2.address;
            await expect(feesManager.connect(owner).setFeesWallet(newFeesWallet))
                .to.emit(feesManager, "FeesWalletSet")
                .withArgs(newFeesWallet);

            expect(await feesManager.feesWallet()).to.equal(newFeesWallet);
        });

        it("should not allow non-admin to set a new fees wallet", async function () {
            await expect(feesManager.connect(user1).setFeesWallet(user2.address))
                .to.be.revertedWith("Missing `FEES_MANAGER_ROLE`");
        });

        it("should allow admin to update transaction fee rate", async function () {
            const newFeeRate = 200; // 2%
            await expect(feesManager.connect(admin).setTxFeeRate(newFeeRate))
                .to.emit(feesManager, "TxFeeRateSet")
                .withArgs(newFeeRate);

            expect(await feesManager.txFeeRate()).to.equal(newFeeRate);
        });
        it("should not allow non-admin to update transaction fee rate", async function () {
            const newFeeRate = 200; // 2%
            await expect(feesManager.connect(user1).setTxFeeRate(newFeeRate))
                .to.be.revertedWith("Missing `FEES_MANAGER_ROLE`");
        });

        it("should allow admin to update min and max transaction fees", async function () {
            const newMinFee = ethers.parseEther("0.001");
            const newMaxFee = ethers.parseEther("1");

            // Set the new min and max transaction fees
            await expect(feesManager.connect(owner).setMinAndMaxTxFee(newMinFee, newMaxFee))
                .to.emit(feesManager, "MinAndMaxTxFeeSet")
                .withArgs(newMinFee, newMaxFee);

            // Min and max fees should match the new values
            expect(await feesManager.minTxFee()).to.equal(newMinFee);
            expect(await feesManager.maxTxFee()).to.equal(newMaxFee);
        });

        it("should not allow non-admin to update min and max transaction fees", async function () {
            const newMinFee = ethers.parseEther("0.001");
            const newMaxFee = ethers.parseEther("1");

            // Set the new min and max transaction fees
            await expect(feesManager.connect(user1).setMinAndMaxTxFee(newMinFee, newMaxFee))
                .to.be.revertedWith("Missing `FEES_MANAGER_ROLE`");
        });

        it("should allow admin to add an account to the zero fee group", async function () {
            const accountToWhitelist = user1.address;
            const SPECIAL_AGAU_GROUP_ID = await feesManager.SPECIAL_AGAU_GROUP_ID();

            // Add the account to the zero fee group
            await expect(feesManager.connect(admin).setGroupForUser(
                GroupType.TxFee,
                SPECIAL_AGAU_GROUP_ID,
                accountToWhitelist
            ))
                .to.emit(feesManager, "UserToFeeGroupSet")
                .withArgs(GroupType.TxFee, accountToWhitelist, SPECIAL_AGAU_GROUP_ID);

            // Check that the account is in the zero fee group
            const groupId = await feesManager.discountGroupIdForUser(GroupType.TxFee, accountToWhitelist);
            expect(groupId).to.equal(SPECIAL_AGAU_GROUP_ID);
        });

        it("should allow admin to remove an account from the zero fee group", async function () {
            const accountToRemove = user1.address;

            // Add the account to the zero fee group
            const SPECIAL_AGAU_GROUP_ID = await feesManager.SPECIAL_AGAU_GROUP_ID();
            await feesManager.connect(owner).setGroupForUser(
                GroupType.TxFee,
                SPECIAL_AGAU_GROUP_ID,
                accountToRemove
            );

            // Remove the account from the zero fee group
            await expect(feesManager.connect(admin).setGroupForUser(
                GroupType.TxFee,
                0,
                accountToRemove
            ))
                .to.emit(feesManager, "UserToFeeGroupSet")
                .withArgs(GroupType.TxFee, accountToRemove, 0);

            const groupId = await feesManager.discountGroupIdForUser(GroupType.TxFee, accountToRemove);
            expect(groupId).to.equal(0);
        });
        it("should not allow non-admin to remove an account from the zero fee group", async function () {
            const accountToRemove = user2.address;

            // Add the account to the zero fee group
            const SPECIAL_AGAU_GROUP_ID = await feesManager.SPECIAL_AGAU_GROUP_ID();
            await expect(feesManager.connect(user1).setGroupForUser(
                GroupType.TxFee,
                SPECIAL_AGAU_GROUP_ID,
                accountToRemove
            )).to.be.revertedWith("Missing `FEES_MANAGER_ROLE`");

        });
    });

    describe("Fee Calculation", function () {
        it("should calculate correct fees for zero fee and non-zero fee accounts", async function () {
            const amount = ethers.parseEther("100");
            const zeroFeeAccount = user1.address;
            const nonZeroFeeAccount = user2.address;
            const nonZeroFeeAccount2 = user3.address;

            const SPECIAL_AGAU_GROUP_ID = await feesManager.SPECIAL_AGAU_GROUP_ID();

            // Add user1 to the zero fee group
            await feesManager.connect(owner).setGroupForUser(
                GroupType.TxFee,
                SPECIAL_AGAU_GROUP_ID,
                zeroFeeAccount
            );

            // Calculate fees
            const feeForZeroFeeAccount = await feesManager["calculateTxFee(address,address,uint256)"](zeroFeeAccount, nonZeroFeeAccount, amount);
            const feeForNonZeroFeeAccount = await feesManager["calculateTxFee(address,address,uint256)"](nonZeroFeeAccount, nonZeroFeeAccount2, amount);

            expect(feeForZeroFeeAccount).to.equal(ethers.toBigInt(0));
            expect(feeForNonZeroFeeAccount).to.be.gt(ethers.toBigInt(0));
        });
    });
});
