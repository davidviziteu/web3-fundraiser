const hre = require("hardhat");
const { ethers } = hre
const GOERLI_URL = "https://eth-mainnet.alchemyapi.io/v2/ClEk4v7DWtheMeP57VEM2-d3hmXsw0wP"
//random wallet I have
const GOERIL_PRIVATE_key = "0xd20efa125a20467fbe80c05860c4065780e137cfb7ae8742e65511f9ab6"

async function main() {
  await hre.run('compile');

  const [deployer] = await ethers.getSigners();
  // and then here we deploy the contract as we did in the tests. we can call functions here etc
}