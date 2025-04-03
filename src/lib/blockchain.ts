import { ethers } from 'ethers';

if (!process.env.BASE_RPC_URL) {
  throw new Error('Invalid/Missing environment variable: "BASE_RPC_URL"');
}

const rpcUrl = process.env.BASE_RPC_URL;

// Create a provider instance
const provider = new ethers.JsonRpcProvider(rpcUrl);

// Function to get provider
export function getProvider() {
  return provider;
}

// Function to get chain id
export async function getChainId() {
  const network = await provider.getNetwork();
  return network.chainId;
}

// Example function to listen for events from a contract
export function listenForEvents(contractAddress: string, abi: ethers.InterfaceAbi, eventName: string) {
  const contract = new ethers.Contract(contractAddress, abi, provider);
  
  contract.on(eventName, (...args) => {
    const event = args[args.length - 1];
    console.log('Event received:', event);
    // Here you would process and store the event in MongoDB
  });
  
  return contract;
}

// Example function to get past events from a contract
export async function getPastEvents(
  contractAddress: string, 
  abi: ethers.InterfaceAbi, 
  eventName: string,
  fromBlock: number,
  toBlock: number | 'latest' = 'latest'
) {
  const contract = new ethers.Contract(contractAddress, abi, provider);
  const filter = contract.filters[eventName]();
  
  const events = await contract.queryFilter(filter, fromBlock, toBlock);
  return events;
}