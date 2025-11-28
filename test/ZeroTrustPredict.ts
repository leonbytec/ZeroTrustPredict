import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { PredictCoin, PredictCoin__factory, ZeroTrustPredict, ZeroTrustPredict__factory } from "../types";

type Fixture = {
  predictCoin: PredictCoin;
  zeroTrustPredict: ZeroTrustPredict;
  zeroTrustAddress: string;
};

const deployFixture = async (): Promise<Fixture> => {
  const predictCoinFactory = (await ethers.getContractFactory("PredictCoin")) as PredictCoin__factory;
  const predictCoin = (await predictCoinFactory.deploy()) as PredictCoin;

  const zeroTrustPredictFactory = (await ethers.getContractFactory("ZeroTrustPredict")) as ZeroTrustPredict__factory;
  const zeroTrustPredict = (await zeroTrustPredictFactory.deploy(await predictCoin.getAddress())) as ZeroTrustPredict;
  const zeroTrustAddress = await zeroTrustPredict.getAddress();

  return { predictCoin, zeroTrustPredict, zeroTrustAddress };
};

describe("ZeroTrustPredict", function () {
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let fixture: Fixture;

  before(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    fixture = await deployFixture();
  });

  it("creates predictions with valid metadata", async function () {
    const { zeroTrustPredict } = fixture;

    const tx = await zeroTrustPredict.connect(alice).createPrediction("Daily BTC Close", ["Up", "Down", "Flat"]);
    await tx.wait();

    const count = await zeroTrustPredict.predictionsCount();
    expect(count).to.eq(1n);

    const prediction = await zeroTrustPredict.getPrediction(0);
    expect(prediction[0]).to.eq("Daily BTC Close");
    expect(prediction[1]).to.eq(await alice.getAddress());
    expect(prediction[4]).to.deep.eq(["Up", "Down", "Flat"]);
  });

  it("processes encrypted selections and updates tallies", async function () {
    const { predictCoin, zeroTrustPredict, zeroTrustAddress } = fixture;

    await zeroTrustPredict.connect(alice).createPrediction("FHE Adoption", ["<10 partners", "10-50 partners", ">50 partners"]);

    await predictCoin.connect(bob).faucet();
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
    await predictCoin.connect(bob).setOperator(zeroTrustAddress, expiry);

    const stakeAmount = BigInt(2_500_000); // 2.5 PCoin (6 decimals)
    const optionIndex = 2;

    const encryptedOption = await fhevm.createEncryptedInput(zeroTrustAddress, bob.address).add8(optionIndex).encrypt();
    const encryptedStake = await fhevm
      .createEncryptedInput(await predictCoin.getAddress(), zeroTrustAddress)
      .add64(stakeAmount)
      .encrypt();

    const placeTx = await zeroTrustPredict
      .connect(bob)
      .placeEncryptedSelection(
        0,
        encryptedOption.handles[0],
        encryptedOption.inputProof,
        encryptedStake.handles[0],
        encryptedStake.inputProof,
      );
    await placeTx.wait();

    const prediction = await zeroTrustPredict.getPrediction(0);
    const selectionCounts = prediction[5];
    const stakeTotals = prediction[6];
    const totalStake = prediction[7];

    const decryptedCount = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      selectionCounts[optionIndex],
      zeroTrustAddress,
      bob,
    );
    expect(decryptedCount).to.eq(1n);

    const decryptedStakeForOption = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      stakeTotals[optionIndex],
      zeroTrustAddress,
      bob,
    );
    expect(decryptedStakeForOption).to.eq(stakeAmount);

    const decryptedTotalStake = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      totalStake,
      zeroTrustAddress,
      bob,
    );
    expect(decryptedTotalStake).to.eq(stakeAmount);

    const encryptedUserStake = await zeroTrustPredict.getUserStake(0, bob.address);
    const decryptedUserStake = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedUserStake,
      zeroTrustAddress,
      bob,
    );
    expect(decryptedUserStake).to.eq(stakeAmount);

    const encryptedChoice = await zeroTrustPredict.getUserChoice(0, bob.address);
    const decryptedChoice = await fhevm.userDecryptEuint(FhevmType.euint8, encryptedChoice, zeroTrustAddress, bob);
    expect(Number(decryptedChoice)).to.eq(optionIndex);
  });

  it("prevents non-creators from toggling predictions", async function () {
    const { zeroTrustPredict } = fixture;

    await zeroTrustPredict.connect(alice).createPrediction("Network Upgrade", ["Yes", "No"]);
    await expect(zeroTrustPredict.connect(bob).setPredictionActive(0, false)).to.be.revertedWithCustomError(
      zeroTrustPredict,
      "NotPredictionCreator",
    );
  });

  it("rejects invalid option counts", async function () {
    const { zeroTrustPredict } = fixture;
    await expect(zeroTrustPredict.connect(alice).createPrediction("Invalid", ["OnlyOne"])).to.be.revertedWithCustomError(
      zeroTrustPredict,
      "InvalidOptionCount",
    );
  });
});
