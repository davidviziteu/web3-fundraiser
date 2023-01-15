const { expect, assert } = require("chai")
const { ethers } = require("hardhat")
const { time } = require("@nomicfoundation/hardhat-network-helpers")

console.log('starting tests..');
let coinContract
let fundRaiseCtr
let owner
let addr1
let addr2
let addrs

async function deploy() {
  const fundRaiserDeploy = await ethers.getContractFactory("Fundraiser");
  const myCoinDeploy = await ethers.getContractFactory("Mytoken");
  [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
  coinContract = await myCoinDeploy.deploy()
  await coinContract.deployed()

  fundRaiseCtr = await fundRaiserDeploy.deploy(coinContract.address)
  await fundRaiseCtr.deployed()
  console.log('deployed');

  await coinContract.connect(owner).pumpMoney(20);
  await coinContract.connect(addr1).pumpMoney(20);
  await coinContract.connect(addr2).pumpMoney(20);
}

describe("basic tests", async function () {
  it(`should check basic enrollment`, async () => {
    await deploy().catch((error) => {
      console.error(error)
      exit(1)
    });
    await fundRaiseCtr.connect(addr1).applyForFunding('Dogs fundraise 0', 10, 2000, 'link to whitepaper 0')
    expect(await (fundRaiseCtr.getProjectCount())).to.be.equal(1)
    await expect((fundRaiseCtr.connect(addr1).applyForFunding('revert goal', 0, 2000, 'link to whitepaper 0')))
      .to.be.revertedWith('You cannot apply for funding with a goal <=  0')
    await expect((fundRaiseCtr.connect(addr1).applyForFunding('revert', 10, 0, '')))
      .to.be.revertedWith('You cannot apply for funding with a duration <= 1 minute')
    await expect((fundRaiseCtr.connect(addr1).applyForFunding('revert', 10, 262801, '')))
      .to.be.revertedWith('You cannot apply for funding with a duration > 6 months')
  })

  it(`should check basic contribution`, async () => {
    await (coinContract.connect(addr2).approve(fundRaiseCtr.address, 18))
    await (fundRaiseCtr.connect(addr2).contribute(0, 2))
    expect(await coinContract.balanceOf(addr2.address)).to.be.equal(18)
    expect(await fundRaiseCtr.getContributionOf(0, addr2.address)).to.be.equal(2)
    expect(await fundRaiseCtr.getAmountRaisedOf(0)).to.be.equal(2)
  })

  it(`should check multiple enrollment`, async () => {
    await (fundRaiseCtr.connect(addr1).applyForFunding('Dogs fundraise 1', 10, 2000, 'link to whitepaper 1'))
    await (fundRaiseCtr.connect(addr1).applyForFunding('Dogs fundraise 2', 1, 2000, 'link to whitepaper 2'))
    await (fundRaiseCtr.connect(addr1).applyForFunding('Dogs fundraise 3', 10, 2000, 'link to whitepaper 3'))
    expect(await (fundRaiseCtr.getProjectCount())).to.be.equal(4)
  })

  it(`should check 'get' functions of the contract`, async () => {
    expect(await (fundRaiseCtr.isContractDepricated())).to.be.equal(false)
    expect(await (fundRaiseCtr.getTokenAddress())).to.be.equal(coinContract.address)
    expect(await (fundRaiseCtr.getGoalOf(0))).to.be.equal(10)
    expect(await (fundRaiseCtr.getGoalOf(1))).to.be.equal(10)
    expect(await (fundRaiseCtr.getGoalOf(2))).to.be.equal(1)
    expect(await (fundRaiseCtr.getGoalOf(3))).to.be.equal(10)
    await expect((fundRaiseCtr.getGoalOf(100))).to.be.revertedWith('Project does not exist')
    for (let i = 0; i < 4; i++) {
      expect(await (fundRaiseCtr.ownerOf(i))).to.be.equal(addr1.address)
      expect(await (fundRaiseCtr.getProjectNameOf(i))).to.be.equal('Dogs fundraise ' + i)
      expect(await (fundRaiseCtr.descriptionLinkOf(i))).to.be.equal('link to whitepaper ' + i)
    }
    expect(await fundRaiseCtr.getContributionOf(1, addr2.address)).to.be.equal(0)
    expect(await fundRaiseCtr.getAmountRaisedOf(1)).to.be.equal(0)

    await expect((fundRaiseCtr.ownerOf(1000))).to.be.revertedWith('Project does not exist')
    await expect((fundRaiseCtr.getProjectNameOf(1000))).to.be.revertedWith('Project does not exist')
    await expect((fundRaiseCtr.descriptionLinkOf(1000))).to.be.revertedWith('Project does not exist')
    await expect(fundRaiseCtr.getContributionOf(1000, addr2.address)).to.be.revertedWith('Project does not exist')
    await expect(fundRaiseCtr.getAmountRaisedOf(1000)).to.be.revertedWith('Project does not exist')
    await expect(fundRaiseCtr.getDeadlineOf(1000)).to.be.revertedWith('Project does not exist')

    let block = await ethers.provider.getBlock('latest')
    await (fundRaiseCtr.connect(addr1).applyForFunding('Dogs fundraise 3', 10, 2000, 'link to whitepaper 3'))
    //add 2000 minutes to current block timestamp
    let expectedDeadline = block.timestamp + 2000 * 60
    let actualDeadline = await (fundRaiseCtr.getDeadlineOf(4))
    expect(Math.abs(expectedDeadline - actualDeadline)).to.be.lessThan(10)
  })

  it(`should test changing description link of project`, async () => {
    await expect(fundRaiseCtr.connect(owner).changeDescriptionLinkOf(0, 'new link to whitepaper 0'))
      .to.be.revertedWith('You are not the owner of this project')
    await (fundRaiseCtr.connect(addr1).changeDescriptionLinkOf(0, 'new descr'))
    expect(await (fundRaiseCtr.descriptionLinkOf(0))).to.be.equal('new descr')
  })

  it(`should test emitted events`, async () => {
    await (coinContract.connect(owner).approve(fundRaiseCtr.address, 1))
    await expect((fundRaiseCtr.connect(owner).contribute(0, 1))).to.emit(fundRaiseCtr, 'ProjectFunded').withArgs(0, 1)
    await (coinContract.connect(owner).approve(fundRaiseCtr.address, 2))
    await expect((fundRaiseCtr.connect(owner).contribute(2, 2))).to.emit(fundRaiseCtr, 'ProjectTargetReached').withArgs(2)
  })

  it(`should test the take funding function`, async () => {
    await expect((fundRaiseCtr.connect(owner).canItakeFundsOf(2))).to.be.reverted
    expect(await (fundRaiseCtr.connect(addr1).canItakeFundsOf(2))).to.be.equal(true)
    let initialBalance = parseInt(await coinContract.balanceOf(addr1.address))
    let projectFunds = parseInt(await fundRaiseCtr.getAmountRaisedOf(2))
    await (fundRaiseCtr.connect(addr1).takeFundsOf(2))
    expect(await (coinContract.balanceOf(addr1.address))).to.be.equal(projectFunds + initialBalance)
  })

  it(`should test the pause functionality of the contract`, async () => {
    expect(await fundRaiseCtr.paused()).to.be.equal(false)
    await expect(fundRaiseCtr.connect(addr1).pause()).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(fundRaiseCtr.connect(addr1).unpause()).to.be.revertedWith('Ownable: caller is not the owner')
    await (fundRaiseCtr.connect(owner).pause())
    expect(await fundRaiseCtr.paused()).to.be.equal(true)
    await expect(fundRaiseCtr.connect(addr1).contribute(0, 1)).to.be.revertedWith('Pausable: paused')
    await expect(fundRaiseCtr.connect(addr1).applyForFunding('should fail', 10, 2000, ''))
      .to.be.revertedWith('Pausable: paused')
    await (fundRaiseCtr.connect(owner).unpause())
  })
})

describe("time and upgrdability tests", async function () {
  it(`should check withdrawal function`, async () => {
    await deploy().catch((error) => {
      console.error(error)
      exit(1)
    });
    await fundRaiseCtr.connect(addr1).applyForFunding('Dogs fundraise 0', 10, 1, 'link to whitepaper 0')
    await fundRaiseCtr.connect(addr1).applyForFunding('Dogs fundraise 1', 10, 2, 'link to whitepaper 1')
    await fundRaiseCtr.connect(addr1).applyForFunding('Dogs fundraise 3', 10, 3, 'link to whitepaper 3')
    expect(await (fundRaiseCtr.getProjectCount())).to.be.equal(3)
    await (coinContract.connect(owner).approve(fundRaiseCtr.address, 2))
    await (coinContract.connect(addr1).approve(fundRaiseCtr.address, 2))
    await (fundRaiseCtr.connect(owner).contribute(0, 2))
    await (fundRaiseCtr.connect(addr1).contribute(1, 2))
    await (coinContract.connect(addr1).approve(fundRaiseCtr.address, 2))
    await (fundRaiseCtr.connect(addr1).contribute(1, 2))
    expect(await (fundRaiseCtr.getAmountRaisedOf(0))).to.be.equal(2)
    await expect(fundRaiseCtr.connect(owner).canIWithdrawl(0)).to.be.revertedWith('Project is still active')
    await expect(fundRaiseCtr.connect(owner).canIWithdrawl(1)).to.be.revertedWith('You have not contributed to this project')
    await time.increase(time.duration.minutes(1))
    expect(await fundRaiseCtr.connect(owner).canIWithdrawl(0)).to.be.equal(true)
    let balanceBefore = parseInt(await coinContract.balanceOf(owner.address))
    let raisedAmount = parseInt(await fundRaiseCtr.getAmountRaisedOf(0))
    await fundRaiseCtr.connect(owner).withdrawl(0)
    let balanceAfter = parseInt(await coinContract.balanceOf(owner.address))
    expect(balanceAfter).to.be.equal(raisedAmount + balanceBefore)
  })

  it(`should check the upgradability of the contract`, async () => {
    await time.increase(time.duration.minutes(5)) //we have project index 1 with 4 coins raised
    expect(await fundRaiseCtr.connect(addr1).isContractDepricated()).to.be.equal(false)

    await (fundRaiseCtr.connect(owner).setNextFundraiser(owner.address))//random address
    await expect(fundRaiseCtr.connect(addr1).isContractDepricated()).to.be
      .revertedWith('Current contract is depricated - no one can submit or fund projects; existing funds can be withdrawn')

    await expect(fundRaiseCtr.connect(addr1).applyForFunding('should fail', 10, 2000, ''))
      .to.be.revertedWith('Pausable: paused')
    await expect(fundRaiseCtr.connect(addr1).contribute(1, 1)).to.be.revertedWith('Pausable: paused')
    let addr1Contribution = parseInt(await fundRaiseCtr.getContributionOf(1, addr1.address))
    let addr1Balance = parseInt(await coinContract.balanceOf(addr1.address))
    await (fundRaiseCtr.connect(addr1).withdrawl(1))
    expect(await (coinContract.balanceOf(addr1.address))).to.be.equal(addr1Contribution + addr1Balance)
  })
})