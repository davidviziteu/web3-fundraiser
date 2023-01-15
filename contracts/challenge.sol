// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Mytoken is ERC20 {
  constructor() ERC20("Mytoken", "MTK") {}

  function pumpMoney(uint256 _amount) public {
    _mint(msg.sender, _amount);
  }

}

//pausable is for upgradability 
abstract contract Pausable {
  bool private _pauseFlag;
  constructor(){
    _pauseFlag = false;
  }

  function paused() public view returns(bool) {
    return _pauseFlag;
  } 

  function _checkPaused() internal view virtual {
    require(_pauseFlag == false, "Pausable: paused");
  }

  modifier whenNotPaused() {
    _checkPaused();
    _;
  }

  function _pause() internal {
    _pauseFlag = true;
  }

  function _unpause() internal {
    _pauseFlag = false;
  }

  function pause() public virtual;
  function unpause() public virtual;
}

interface IFundraiser {

  event ProjectTargetReached(uint256 indexed id);
  event ProjectFunded(uint256 indexed id, uint256 amount);

  function getTokenAddress() external view returns (address);
  function getProjectCount() external view returns (uint256);
  function contribute(uint256 _projectId, uint256 _amount) external;
  function takeFundsOf(uint256 _projectId) external;
  function withdrawl(uint256 _projectId) external;
}

abstract contract BaseFundraiser is IFundraiser, Pausable, Ownable {
  function pause() public override onlyOwner {
    _pause();
  }

  function unpause() public override onlyOwner {
    _unpause();
  }

  address nextFundraiser;
  
  function setNextFundraiser(address _nextFundraiser) public onlyOwner {
    //should check for 0 address
    nextFundraiser = _nextFundraiser;
    _pause();
  }

  constructor(){
    nextFundraiser = address(0);
  }
}

contract Fundraiser is BaseFundraiser {

  struct Project {
    uint256 goal;
    uint256 deadlineTime;
    uint256 amountRaised;
    address payable owner;
    string name;            
    string descriptionLink; // a link to point to some description of the project
    mapping(address => uint256) contributions;
  }

  uint256 private projectCount;
  address private tokenAddress;
  Project[] private projects;

  constructor(address _tokenAddress) {
    projectCount = 0;
    tokenAddress = _tokenAddress; 
    // if the token is newer, we could also check if it is an ERC20 token
    // with supportsInterface() function, but as some tokens do not implement this function
    // I will not try to check it in this challenge

    IERC20(tokenAddress).approve(address(this), type(uint256).max); 
    nextFundraiser = address(0);
  }

  function isContractDepricated() public view returns (bool) {
    require(nextFundraiser == address(0), "Current contract is depricated - no one can submit or fund projects; existing funds can be withdrawn");
    return false;
  }

  function getTokenAddress() public view returns (address) {
    return tokenAddress;
  }

  function getProjectCount() public view returns (uint256) {
    return projectCount;
  }

  function changeDescriptionLinkOf(uint256 _projectId, string memory _newDescriptionLink) public {
    require(_projectId < projectCount, "Project does not exist");
    Project storage project = projects[_projectId];
    require(msg.sender == project.owner, "You are not the owner of this project");
    project.descriptionLink = _newDescriptionLink;
  }

  function applyForFunding(string memory _name, uint256 _goal, uint32 _fundingDurationMinutes, string memory _descriptionLink) public whenNotPaused returns (uint256){
    require(_goal > 0, "You cannot apply for funding with a goal <=  0");
    require(_fundingDurationMinutes >= 1, "You cannot apply for funding with a duration <= 1 minute");
    require(_fundingDurationMinutes <= 262800, "You cannot apply for funding with a duration > 6 months");
    // duration be customisable by params in constructor, but I think [1 minute, 6 months] is enough for testing
    projects.push();
    Project storage newProject = projects[projectCount++];
    newProject.name = _name;
    newProject.descriptionLink = _descriptionLink;
    newProject.goal = _goal;
    newProject.deadlineTime = _fundingDurationMinutes * 1 minutes + block.timestamp;
    newProject.owner = payable(msg.sender);
    return projectCount - 1;
  }

  function canIWithdrawl(uint256 _projectId) public view returns (bool) {
    require(_projectId < projectCount, "Project does not exist");
    Project storage project = projects[_projectId];
    require(project.contributions[msg.sender] > 0, "You have not contributed to this project");
    require(project.deadlineTime <= block.timestamp, "Project is still active");    
    require(project.amountRaised < project.goal, "Project has met its goal");
    return true;
  }

  function withdrawl(uint256 _projectId) public {
    require(canIWithdrawl(_projectId), "You cannot withdrawl");
    Project storage project = projects[_projectId];
    uint256 oldAmountRaised = project.amountRaised; // point 4
    project.amountRaised = oldAmountRaised - project.contributions[msg.sender];
    uint256 amount = project.contributions[msg.sender];
    project.contributions[msg.sender] = 0;
    IERC20(tokenAddress).transfer(msg.sender, amount);
  }

  function contribute(uint256 _projectId, uint256 _amount) public whenNotPaused {
    require(_projectId < projectCount, "Project does not exist");
    Project storage project = projects[_projectId];
    require(project.deadlineTime > block.timestamp, "Project is no longer active");
    require(_amount > 0, "You must contribute more than 0");
    IERC20(tokenAddress).transferFrom(msg.sender, address(this), _amount);
    if(project.contributions[msg.sender] == 0)
      project.contributions[msg.sender] = _amount; 
    else {
      uint256 oldAmount = project.contributions[msg.sender]; // point 4
      project.contributions[msg.sender] = oldAmount + _amount;
    }
    uint256 oldAmountRaised = project.amountRaised; // point 4
    project.amountRaised = _amount + oldAmountRaised;
    emit ProjectFunded(_projectId, _amount);
    if(project.amountRaised >= project.goal)
      emit ProjectTargetReached(_projectId);
  }

  function canItakeFundsOf(uint256 _projectId) public view returns (bool) {
    require(_projectId < projectCount, "Project does not exist");
    Project storage project = projects[_projectId];
    require(project.owner == msg.sender, "You are not the owner of this project");
    require(project.deadlineTime >= block.timestamp, "Project is still active");    
    require(project.amountRaised >= project.goal, "Project hasn't met its goal");
    return true;
  }

  function takeFundsOf(uint256 _projectId) public {
    require(canItakeFundsOf(_projectId), "You cannot take funds");
    Project storage project = projects[_projectId];
    project.goal = 0;
    IERC20(tokenAddress).transferFrom(address(this), msg.sender, project.amountRaised);
  }

  function getContributionOf(uint256 _projectId, address _contributor) public view returns (uint256) {
    require(_projectId < projectCount, "Project does not exist");
    Project storage project = projects[_projectId];
    return project.contributions[_contributor];
  }

  function getAmountRaisedOf(uint256 _projectId) public view returns (uint256) {
    require(_projectId < projectCount, "Project does not exist");
    Project storage project = projects[_projectId];
    return project.amountRaised;
  }

  function getDeadlineOf(uint256 _projectId) public view returns (uint256) {
    require(_projectId < projectCount, "Project does not exist");
    Project storage project = projects[_projectId];
    return project.deadlineTime;
  }

  function getGoalOf(uint256 _projectId) public view returns (uint256) {
    require(_projectId < projectCount, "Project does not exist");
    Project storage project = projects[_projectId];
    return project.goal;
  }

  function getProjectNameOf(uint256 _projectId) public view returns (string memory) {
    require(_projectId < projectCount, "Project does not exist");
    Project storage project = projects[_projectId];
    return project.name;
  }

  function ownerOf(uint256 _projectId) public view returns (address){
    require(_projectId < projectCount, "Project does not exist");
    Project storage project = projects[_projectId];
    return project.owner;
  }

  function descriptionLinkOf(uint256 _projectId) public view returns (string memory){
    require(_projectId < projectCount, "Project does not exist");
    Project storage project = projects[_projectId];
    return project.descriptionLink;
  }
}

/**
Your contract(s) should be written such that:

1. Funds take the form of a custom ERC20 token
2. Crowdfunded projects have a funding goal
3. When a funding goal is not met, customers are be able to get a refund of their pledged funds
4. dApps using the contract can observe state changes in transaction logs
5. Optional bonus: contract is upgradeable


1. Submit your project on GitHub as a public repository that we can run locally, preferably using truffle, ganache, and hardhat.

If you prefer to use different tools, provide explicit instructions to get the contract up and running locally. We should be 
able to open the provided repository in VSCode and get the contract running locally within a few minutes.

2. Record a video of 5 min or less. Loom is a free online tool you could use. In the video, you will do a code walk-through where 
you share your screen and explain the code. In the code walk-through, run your code and explain the resulting output.


• Code compiles
• Code accomplishes task described in prompt
• Code has no glaring security issues
• Code is readable and organized
• Demonstrates ability to create and use modifiers appropriately
• Demonstrates ability to create and emit events appropriately
• Demonstrates ability to use contract inheritance appropriately
• Demonstrates ability to validate conditions and throw sensible errors
• Demonstrates ability to appropriately use global functions to access
information about the transaction, block, address, etc.
• Demonstrates ability to choose appropriate memory types for
parameters, variables, etc.
• Smart contract can quickly and easily be run on a local network
• Project demonstrates understanding of common EVM developer
tooling, e.g. truffle, ganache, hardhat, etc.
• Contract is upgradeable

Explanation


• Demo and code read-aloud is submitted
• Demo and code read-aloud is complete (all steps explained)
• Demo and code read-aloud is clear and understandable
 */