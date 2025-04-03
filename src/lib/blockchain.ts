import { ethers } from 'ethers';
import { 
  HypermapEvent, MintEvent, FactEvent, NoteEvent, 
  GeneEvent, TransferEvent, ZeroEvent, UpgradedEvent 
} from '../types';
import { 
  CONTRACT_ADDRESS, DEFAULT_START_BLOCK, DEFAULT_CHUNK_SIZE, 
  DEFAULT_BASE_DELAY_MS, MIN_CHUNK_SIZE, MAX_RETRIES 
} from '../constants';
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

// Function to get past events from the contract with exponential backoff
export async function getPastEvents(
  eventName: string,
  fromBlock: number,
  toBlock: number | 'latest' = 'latest'
) {
  let retryCount = 0;
  let baseDelay = DEFAULT_BASE_DELAY_MS;
  
  while (true) {
    try {
      const filter = contract.filters[eventName]();
      const events = await contract.queryFilter(filter, fromBlock, toBlock);
      return events;
    } catch (error) {
      // Check if error is rate limiting or too many requests
      const isRateLimitError = 
        error.toString().includes("Too Many Requests") || 
        error.toString().includes("rate limit") ||
        (error.code === "BAD_DATA" && error.toString().includes("missing response"));
      
      if (isRateLimitError && retryCount < MAX_RETRIES) {
        retryCount++;
        // Calculate exponential delay with random jitter
        const delay = baseDelay * Math.pow(2, retryCount) + Math.random() * 1000;
        console.log(`Rate limited on ${eventName} (blocks ${fromBlock}-${toBlock}). Retrying in ${Math.round(delay/1000)} seconds... (Attempt ${retryCount}/${MAX_RETRIES})`);
        
        // Wait before trying again
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Either not a rate limit error or exceeded retries
        throw error;
      }
    }
  }
}

// Function to get multiple event types in a single block range
export async function getMultipleEvents(
  eventNames: string[],
  fromBlock: number,
  toBlock: number
): Promise<ethers.Log[]> {
  // Get events sequentially to avoid overwhelming the RPC provider
  let allEvents: ethers.Log[] = [];
  
  for (const eventName of eventNames) {
    const events = await getPastEvents(eventName, fromBlock, toBlock);
    allEvents = allEvents.concat(events);
  }
  
  // Sort by block number and log index
  allEvents.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber - b.blockNumber;
    }
    return (a.index || 0) - (b.index || 0); // Use index for ethers v6
  });
  
  return allEvents;
}

// Process events in chunks with adaptive chunk size and exponential backoff
export async function processEventsInChunks(
  fromBlock: number,
  toBlock: number,
  callback: (events: HypermapEvent[]) => Promise<void>,
  eventNames: string[] = ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'],
  chunkSizeOverride?: number
) {
  let adaptiveChunkSize = chunkSizeOverride || chunkSize;
  let currentFromBlock = fromBlock;
  let consecutiveSuccesses = 0;
  let consecutiveFailures = 0;

  while (currentFromBlock <= toBlock) {
    const currentToBlock = Math.min(currentFromBlock + adaptiveChunkSize - 1, toBlock);
    let retryCount = 0;
    let currentDelay = baseDelayMs;
    let success = false;
    
    // Retry loop for this chunk
    while (!success && retryCount <= MAX_RETRIES) {
      try {
        console.log(`Processing blocks ${currentFromBlock} to ${currentToBlock}${retryCount > 0 ? ` (retry ${retryCount}/${MAX_RETRIES})` : ''}...`);
        console.log(`Current chunk size: ${adaptiveChunkSize} blocks`);
        
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
        success = true;
        
        // Adapt chunk size based on success
        consecutiveSuccesses++;
        consecutiveFailures = 0;
        
        // Increase chunk size after several consecutive successes
        if (consecutiveSuccesses >= 3) {
          const oldChunkSize = adaptiveChunkSize;
          adaptiveChunkSize = Math.min(adaptiveChunkSize * 1.5, DEFAULT_CHUNK_SIZE);
          if (oldChunkSize !== adaptiveChunkSize) {
            console.log(`Increased chunk size to ${adaptiveChunkSize} after ${consecutiveSuccesses} consecutive successes`);
          }
          consecutiveSuccesses = 0;
        }
      } catch (error) {
        // Check if error is rate limiting or too many requests
        const isRateLimitError = 
          error.toString().includes("Too Many Requests") || 
          error.toString().includes("rate limit") ||
          (error.code === "BAD_DATA" && error.toString().includes("missing response"));
        
        console.error(`Error processing blocks ${currentFromBlock} to ${currentToBlock}:`, error);
        
        if (isRateLimitError && retryCount < MAX_RETRIES) {
          retryCount++;
          consecutiveFailures++;
          
          // Calculate exponential delay with random jitter
          const delay = currentDelay * Math.pow(2, retryCount) + Math.random() * 1000;
          console.log(`Rate limited. Retrying in ${Math.round(delay/1000)} seconds... (Attempt ${retryCount}/${MAX_RETRIES})`);
          
          // Wait before trying again
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Reduce chunk size if we're seeing rate limit errors
          if (consecutiveFailures >= 2 || retryCount >= 3) {
            const oldChunkSize = adaptiveChunkSize;
            adaptiveChunkSize = Math.max(Math.floor(adaptiveChunkSize / 2), MIN_CHUNK_SIZE);
            
            if (oldChunkSize !== adaptiveChunkSize) {
              console.log(`Reduced chunk size to ${adaptiveChunkSize} due to rate limiting`);
            }
            
            // If we've significantly reduced the chunk size, try again with the new size
            if (adaptiveChunkSize < oldChunkSize / 2) {
              console.log(`Switching to smaller chunk size of ${adaptiveChunkSize} blocks...`);
              break; // Exit the retry loop to try again with the new chunk size
            }
          }
        } else {
          // Non-rate limiting error or max retries exceeded, continue to next chunk
          consecutiveSuccesses = 0;
          consecutiveFailures++;
          
          console.log(`Moving to next chunk after error`);
          success = true; // to exit the retry loop
        }
      }
    }
    
    // Only advance to the next chunk if we had success or exhausted retries
    if (success) {
      // Move to next chunk
      currentFromBlock = currentToBlock + 1;
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, baseDelayMs));
    }
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