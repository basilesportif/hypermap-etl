import { ethers } from 'ethers';
import { 
  HypermapEvent, MintEvent, FactEvent, NoteEvent, 
  GeneEvent, TransferEvent, ZeroEvent, UpgradedEvent 
} from '../types';
import { CONTRACT_ADDRESS, DEFAULT_START_BLOCK, DEFAULT_CHUNK_SIZE, DEFAULT_BASE_DELAY_MS } from '../constants';
import hypermapAbi from '../abi/hypermap.abi.json';

// Environment variables
if (!process.env.BASE_RPC_URL) {
  throw new Error('Invalid/Missing environment variable: "BASE_RPC_URL"');
}

const rpcUrl = process.env.BASE_RPC_URL;
const startBlock = process.env.START_BLOCK ? parseInt(process.env.START_BLOCK) : DEFAULT_START_BLOCK;
const chunkSize = process.env.CHUNK_SIZE ? parseInt(process.env.CHUNK_SIZE) : DEFAULT_CHUNK_SIZE;
const baseDelayMs = process.env.BASE_DELAY_MS ? parseInt(process.env.BASE_DELAY_MS) : DEFAULT_BASE_DELAY_MS;

// Create a provider instance
const provider = new ethers.JsonRpcProvider(rpcUrl);
const contract = new ethers.Contract(CONTRACT_ADDRESS, hypermapAbi, provider);

// Function to get provider
export function getProvider() {
  return provider;
}

// Function to get chain id
export async function getChainId() {
  const network = await provider.getNetwork();
  return network.chainId;
}

// Function to listen for events from the contract
export function listenForEvents(eventNames: string[] = []) {
  const allEventNames = eventNames.length > 0 ? eventNames : [
    'Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'
  ];
  
  allEventNames.forEach(eventName => {
    contract.on(eventName, async (...args) => {
      const event = args[args.length - 1];
      console.log(`${eventName} event received:`, event);
      
      // Process the event
      const processedEvent = await processEvent(event);
      return processedEvent;
    });
  });
  
  return contract;
}

// Function to get past events from the contract
export async function getPastEvents(
  eventName: string,
  fromBlock: number,
  toBlock: number | 'latest' = 'latest'
) {
  const filter = contract.filters[eventName]();
  const events = await contract.queryFilter(filter, fromBlock, toBlock);
  return events;
}

// Function to get multiple event types in a single block range
export async function getMultipleEvents(
  eventNames: string[],
  fromBlock: number,
  toBlock: number
): Promise<ethers.Log[]> {
  const eventPromises = eventNames.map(eventName => 
    getPastEvents(eventName, fromBlock, toBlock)
  );
  
  const results = await Promise.all(eventPromises);
  // Flatten and sort by block number and log index
  const allEvents = results.flat().sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber - b.blockNumber;
    }
    return a.logIndex - b.logIndex;
  });
  
  return allEvents;
}

// Process events in chunks
export async function processEventsInChunks(
  fromBlock: number,
  toBlock: number,
  callback: (events: HypermapEvent[]) => Promise<void>,
  eventNames: string[] = ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'],
  chunkSizeOverride?: number
) {
  const useChunkSize = chunkSizeOverride || chunkSize;
  let currentFromBlock = fromBlock;

  while (currentFromBlock <= toBlock) {
    const currentToBlock = Math.min(currentFromBlock + useChunkSize - 1, toBlock);
    
    try {
      console.log(`Processing blocks ${currentFromBlock} to ${currentToBlock}...`);
      const events = await getMultipleEvents(eventNames, currentFromBlock, currentToBlock);
      
      // Process events
      const processedEvents = await Promise.all(events.map(processEvent));
      
      // Filter out null values (failed processing)
      const validEvents = processedEvents.filter(e => e !== null) as HypermapEvent[];
      
      // Call the callback with processed events
      if (validEvents.length > 0) {
        try {
          await callback(validEvents);
        } catch (callbackError) {
          console.error(`Error in callback for blocks ${currentFromBlock} to ${currentToBlock}:`, callbackError);
          // Continue processing next chunk
        }
      }
      
      console.log(`Processed ${validEvents.length} events in blocks ${currentFromBlock} to ${currentToBlock}`);
    } catch (error) {
      console.error(`Error processing blocks ${currentFromBlock} to ${currentToBlock}:`, error);
      // Continue with the next chunk instead of throwing
    }
    
    // Move to next chunk
    currentFromBlock = currentToBlock + 1;
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, baseDelayMs));
  }
}

// Process an individual event
async function processEvent(event: ethers.Log): Promise<HypermapEvent | null> {
  try {
    const eventName = event.fragment?.name || '';
    const block = await provider.getBlock(event.blockNumber);
    const timestamp = block ? Number(block.timestamp) : undefined;
    
    // Log the event structure to debug
    console.log('Event structure:', {
      blockNumber: event.blockNumber, 
      logIndex: event.index // ethers v6 uses index instead of logIndex
    });
    
    const baseEvent = {
      blockNumber: event.blockNumber,
      blockHash: event.blockHash,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.index, // ethers v6 uses index instead of logIndex
      timestamp
    };

    switch(eventName) {
      case 'Mint': {
        const args = event.args as unknown as [string, string, string, string];
        return {
          ...baseEvent,
          eventType: 'Mint',
          parenthash: args[0],
          childhash: args[1],
          labelhash: args[2],
          label: args[3]
        } as MintEvent;
      }
      
      case 'Fact': {
        const args = event.args as unknown as [string, string, string, string, string];
        return {
          ...baseEvent,
          eventType: 'Fact',
          parenthash: args[0],
          facthash: args[1],
          labelhash: args[2],
          label: args[3],
          data: args[4]
        } as FactEvent;
      }
      
      case 'Note': {
        const args = event.args as unknown as [string, string, string, string, string];
        return {
          ...baseEvent,
          eventType: 'Note',
          parenthash: args[0],
          notehash: args[1],
          labelhash: args[2],
          label: args[3],
          data: args[4]
        } as NoteEvent;
      }
      
      case 'Gene': {
        const args = event.args as unknown as [string, string];
        return {
          ...baseEvent,
          eventType: 'Gene',
          entry: args[0],
          gene: args[1]
        } as GeneEvent;
      }
      
      case 'Transfer': {
        const args = event.args as unknown as [string, string, ethers.BigNumber];
        return {
          ...baseEvent,
          eventType: 'Transfer',
          from: args[0],
          to: args[1],
          id: args[2].toString()
        } as TransferEvent;
      }
      
      case 'Zero': {
        const args = event.args as unknown as [string];
        return {
          ...baseEvent,
          eventType: 'Zero',
          zeroTba: args[0]
        } as ZeroEvent;
      }
      
      case 'Upgraded': {
        const args = event.args as unknown as [string];
        return {
          ...baseEvent,
          eventType: 'Upgraded',
          implementation: args[0]
        } as UpgradedEvent;
      }
      
      default:
        console.warn(`Unknown event type: ${eventName}`);
        return null;
    }
  } catch (error) {
    console.error('Error processing event:', error);
    return null;
  }
}