import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const predictCoin = await deploy("PredictCoin", {
    from: deployer,
    log: true,
  });

  const zeroTrustPredict = await deploy("ZeroTrustPredict", {
    from: deployer,
    args: [predictCoin.address],
    log: true,
  });

  console.log(`PredictCoin contract: ${predictCoin.address}`);
  console.log(`ZeroTrustPredict contract: ${zeroTrustPredict.address}`);
};
export default func;
func.id = "deploy_zeroTrustPredict"; // id required to prevent reexecution
func.tags = ["ZeroTrustPredict"];
