/**
 * Event Service
 * 
 * Provides functions for processing blockchain events from the HyperMap contract.
 * This is the core service that handles event parsing, normalization, and processing.
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  HypermapEvent, MintEvent, FactEvent, NoteEvent, 
  GeneEvent, TransferEvent, ZeroEvent, UpgradedEvent,
  Bytes, Bytes32, Address
} from '../../types/index.js';

// Load ABI directly (dynamic import with assert doesn't work consistently in all environments)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const abiPath = path.resolve(__dirname, '../../abi/hypermap.abi.json');
const HYPERMAP_ABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

// Contract address
export const CONTRACT_ADDRESS = '0x000000000044C6B8Cb4d8f0F889a3E47664EAeda';

/**
 * Create a provider instance
 */
export function createProvider(rpcUrl: string): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Create a contract instance using the built-in HyperMap ABI
 */
export function createContract(provider: ethers.JsonRpcProvider): ethers.Contract {
  return new ethers.Contract(CONTRACT_ADDRESS, HYPERMAP_ABI, provider);
}

/**
 * Get the timestamp for a block with exponential backoff retry
 */
export async function getBlockTimestamp(
  provider: ethers.JsonRpcProvider, 
  blockNumber: number,
  retryCount = 0,
  maxRetries = 5
): Promise<number | null> {
  try {
    const block = await provider.getBlock(blockNumber);
    return block ? Number(block.timestamp) : null;
  } catch (err) {
    // Check if error is rate limiting related
    const errorMessage = String(err);
    const isRateLimited = 
      errorMessage.includes("Too Many Requests") || 
      errorMessage.includes("rate limit") || 
      errorMessage.includes("429") ||
      errorMessage.includes("exceeded") ||
      (err as any).code === "BAD_DATA";
    
    if (isRateLimited && retryCount < maxRetries) {
      // Calculate exponential backoff delay: 2^retry * 1000ms + random jitter
      const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
      console.warn(`Rate limited getting timestamp for block ${blockNumber}. Retrying in ${Math.round(delay/1000)}s... (Attempt ${retryCount + 1}/${maxRetries})`);
      
      // Wait for the calculated delay
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry with incremented counter
      return getBlockTimestamp(provider, blockNumber, retryCount + 1, maxRetries);
    }
    
    console.warn(`Error getting timestamp for block ${blockNumber}:`, err);
    return null;
  }
}

/**
 * Process an event from the blockchain
 */
export async function processEvent(
  event: any, 
  provider: ethers.JsonRpcProvider
): Promise<HypermapEvent | null> {
  // Validate we have a fragment
  if (!event || !event.fragment) {
    console.warn(`Skipping event without fragment: ${JSON.stringify(event)}`);
    return null;
  }
  
  // Get event name with fallback
  const eventName = event.fragment.name || '';
  if (!eventName) {
    console.warn(`Skipping event with empty name: ${JSON.stringify(event.fragment)}`);
    return null;
  }
  
  // Get timestamp with fallback
  let timestamp;
  try {
    timestamp = await getBlockTimestamp(provider, event.blockNumber);
  } catch (err) {
    console.warn(`Error getting timestamp for block ${event.blockNumber}: ${err}`);
    timestamp = null;
  }
  
  // Create base event data
  const baseEvent = {
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    transactionHash: event.transactionHash,
    transactionIndex: event.transactionIndex,
    logIndex: event.index || event.logIndex, // ethers v6 uses index, fallback to logIndex
    timestamp
  };

  // Safely get arguments with fallbacks
  const args = event.args || [];
  
  let eventData: HypermapEvent | null = null;
  
  switch(eventName) {
    case 'Mint': {
      eventData = {
        ...baseEvent,
        eventType: 'Mint',
        parenthash: args[0],
        childhash: args[1],
        // labelhash is now bytes and indexed
        labelhash: args[2],
        // label is now bytes instead of string
        label: args[3] ? ethers.toUtf8String(args[3]) : ''
      } as MintEvent;
      break;
    }
    
    case 'Fact': {
      eventData = {
        ...baseEvent,
        eventType: 'Fact',
        parenthash: args[0],
        facthash: args[1],
        // labelhash is now bytes and indexed
        labelhash: args[2],
        // label is now bytes instead of string
        label: args[3] ? ethers.toUtf8String(args[3]) : '',
        data: args[4]
      } as FactEvent;
      break;
    }
    
    case 'Note': {
      eventData = {
        ...baseEvent,
        eventType: 'Note',
        parenthash: args[0],
        notehash: args[1],
        // labelhash is now bytes and indexed
        labelhash: args[2],
        // label is now bytes instead of string
        label: args[3] ? ethers.toUtf8String(args[3]) : '',
        data: args[4]
      } as NoteEvent;
      break;
    }
    
    case 'Gene': {
      eventData = {
        ...baseEvent,
        eventType: 'Gene',
        entry: args[0],
        gene: args[1]
      } as GeneEvent;
      break;
    }
    
    case 'Transfer': {
      eventData = {
        ...baseEvent,
        eventType: 'Transfer',
        from: args[0],
        to: args[1],
        id: args[2] ? args[2].toString() : null
      } as TransferEvent;
      break;
    }
    
    case 'Zero': {
      eventData = {
        ...baseEvent,
        eventType: 'Zero',
        zeroTba: args[0]
      } as ZeroEvent;
      break;
    }
    
    case 'Upgraded': {
      eventData = {
        ...baseEvent,
        eventType: 'Upgraded',
        implementation: args[0]
      } as UpgradedEvent;
      break;
    }
    
    default:
      console.warn(`Unknown event type: ${eventName}`);
      return null;
  }
  
  return eventData;
}

/**
 * Parse raw logs into structured events
 */
export async function parseLogsToEvents(
  logs: any[],
  contract: ethers.Contract,
  provider: ethers.JsonRpcProvider
): Promise<HypermapEvent[]> {
  const events = [];
  
  for (const log of logs) {
    try {
      // Try to parse the log using the contract's interface
      const parsedLog = contract.interface.parseLog(log);
      if (parsedLog) {
        // Create a processed event with the parsed data
        const processedEvent = await processEvent({
          ...log,
          fragment: parsedLog.fragment,
          args: parsedLog.args
        }, provider);
        
        if (processedEvent) {
          events.push(processedEvent);
        }
      }
    } catch (error) {
      // Silent error handling - just skip this log
    }
  }
  
  return events;
}

/**
 * Format a timestamp
 */
export function formatTimestamp(timestamp: number | undefined | null): string {
  return timestamp ? new Date(timestamp * 1000).toISOString() : 'Unknown';
}

/**
 * Format a hex string
 */
export function formatHex(hex: string | null | undefined, length = 10): string {
  if (!hex) return 'null';
  return hex.substring(0, length) + '...' + hex.substring(hex.length - 4);
}