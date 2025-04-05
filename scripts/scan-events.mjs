/**
 * HyperMap Event Scanner
 * Usage: npm run scan-events -- --from=27270000 --to=27280000
 * 
 * Scans for events from the HyperMap contract on Base within the specified block range
 * and prints them to the console. Does not store them in the database.
 */

// Import libraries
import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load .env.local only - simple direct approach
const envLocalPath = path.resolve(rootDir, '.env.local');
const envContent = fs.readFileSync(envLocalPath, 'utf8');
const envLines = envContent.split('\n');

for (const line of envLines) {
  if (!line || line.startsWith('#')) continue;
  
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    const value = valueParts.join('=').trim();
    process.env[key.trim()] = value;
  }
}

console.log(`Loaded environment from: ${envLocalPath}`);
console.log('BASE_RPC_URL:', process.env.BASE_RPC_URL);

// Check for required environment variables
if (!process.env.BASE_RPC_URL) {
  console.error('Error: BASE_RPC_URL is not defined in .env or .env.local file');
  process.exit(1);
}

// Contract constants
const CONTRACT_ADDRESS = '0x000000000044C6B8Cb4d8f0F889a3E47664EAeda';
const DEFAULT_START_BLOCK = 27270000; // First block of HyperMap deployment

// Parse command line arguments
const args = process.argv.slice(2);
let fromBlock = DEFAULT_START_BLOCK;
let toBlock = 'latest';

// Always scan for all event types
const eventTypes = ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'];
console.log("Scanning for ALL event types regardless of command line arguments");

// Parse arguments
args.forEach(arg => {
  if (arg.startsWith('--from=')) {
    fromBlock = parseInt(arg.split('=')[1]);
  } else if (arg.startsWith('--to=')) {
    const value = arg.split('=')[1];
    toBlock = value === 'latest' ? 'latest' : parseInt(value);
  }
});

// Load ABI from file
const hypermapAbiPath = path.resolve(rootDir, 'src/abi/hypermap.abi.json');
const hypermapAbi = JSON.parse(fs.readFileSync(hypermapAbiPath, 'utf8'));

// Setup provider and contract
const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, hypermapAbi, provider);

async function getBlockTimestamp(blockNumber) {
  const block = await provider.getBlock(blockNumber);
  return block ? Number(block.timestamp) : null;
}

// Process a single event
async function processEvent(event) {
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
    timestamp = await getBlockTimestamp(event.blockNumber);
  } catch (err) {
    console.warn(`Error getting timestamp for block ${event.blockNumber}: ${err.message}`);
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

  let eventData;
  
  // Safely get arguments with fallbacks
  const args = event.args || [];
  
  switch(eventName) {
    case 'Mint': {
      eventData = {
        ...baseEvent,
        eventType: 'Mint',
        parenthash: args[0],
        childhash: args[1],
        labelhash: args[2],
        label: args[3]
      };
      break;
    }
    
    case 'Fact': {
      eventData = {
        ...baseEvent,
        eventType: 'Fact',
        parenthash: args[0],
        facthash: args[1],
        labelhash: args[2],
        label: args[3],
        data: args[4]
      };
      break;
    }
    
    case 'Note': {
      eventData = {
        ...baseEvent,
        eventType: 'Note',
        parenthash: args[0],
        notehash: args[1],
        labelhash: args[2],
        label: args[3],
        data: args[4]
      };
      break;
    }
    
    case 'Gene': {
      eventData = {
        ...baseEvent,
        eventType: 'Gene',
        entry: args[0],
        gene: args[1]
      };
      break;
    }
    
    case 'Transfer': {
      eventData = {
        ...baseEvent,
        eventType: 'Transfer',
        from: args[0],
        to: args[1],
        id: args[2] ? args[2].toString() : null
      };
      break;
    }
    
    case 'Zero': {
      eventData = {
        ...baseEvent,
        eventType: 'Zero',
        zeroTba: args[0]
      };
      break;
    }
    
    case 'Upgraded': {
      eventData = {
        ...baseEvent,
        eventType: 'Upgraded',
        implementation: args[0]
      };
      break;
    }
    
    default:
      console.warn(`Unknown event type: ${eventName}`);
      return null;
  }
  
  return eventData;
}

// Utility functions for better output
function formatTimestamp(timestamp) {
  return timestamp ? new Date(timestamp * 1000).toISOString() : 'Unknown';
}

function formatHex(hex, length = 10) {
  if (!hex) return 'null';
  return hex.substring(0, length) + '...' + hex.substring(hex.length - 4);
}

// Main scanner function
async function scanEvents() {
  console.log(`Starting event scan from block ${fromBlock} to ${toBlock}`);
  console.log(`Scanning for events: ${eventTypes.join(', ')}`);
  console.log(`Contract address: ${CONTRACT_ADDRESS}`);
  console.log(`RPC URL: ${process.env.BASE_RPC_URL}`);
  console.log('----------------------------------------');
  
  let eventCounts = {};
  let totalEvents = 0;
  eventTypes.forEach(type => { eventCounts[type] = 0 });
  
  if (toBlock === 'latest') {
    const latestBlock = await provider.getBlockNumber();
    console.log(`Latest block: ${latestBlock}`);
    toBlock = latestBlock;
  }
  
  // Calculate the number of blocks
  const blockCount = toBlock - fromBlock + 1;
  console.log(`Scanning ${blockCount.toLocaleString()} blocks`);
  
  // Define chunk size and rate limiting parameters
  const CHUNK_SIZE = 5000; // Reduce to 5k blocks for fewer rate limits
  const DEFAULT_DELAY = 2000; // Increase default delay to 2 seconds
  const MAX_RETRIES = 5;
  const BASE_RETRY_DELAY = 3000; // 3 seconds for exponential backoff
  
  // Run simple periodic status updates
  const statusInterval = setInterval(() => {
    // Simple one-line status update
    const blocksProcessed = Math.min(toBlock, lastProcessedBlock || fromBlock) - fromBlock;
    const blockCompletion = blockCount > 0 ? Math.round((blocksProcessed / blockCount) * 100) : 0;
    console.log(`STATUS: ${totalEvents} events found (${blockCompletion}% complete)`);
  }, 15000); // Update every 15 seconds
  
  // Track the last processed block to calculate progress
  let lastProcessedBlock = fromBlock;
  
  try {
    // Process in chunks of blocks
    for (let startBlock = fromBlock; startBlock <= toBlock; startBlock += CHUNK_SIZE) {
      const endBlock = Math.min(startBlock + CHUNK_SIZE - 1, toBlock);
      let retryCount = 0;
      let success = false;
      
      console.log(`\nScanning blocks ${startBlock.toLocaleString()} to ${endBlock.toLocaleString()}...`);
      
      while (!success && retryCount <= MAX_RETRIES) {
        try {
          // Scan for all event types at once
          let totalChunkEvents = 0;
          
          // Create an array to hold all events from all types
          let allEventsInChunk = [];
          
          // Make a single query for all events from our contract in this block range
          try {
            // Query with filter by contract address (without logging)
            const allEventsFilter = { address: CONTRACT_ADDRESS };
            const events = await provider.getLogs({
              ...allEventsFilter,
              fromBlock: startBlock,
              toBlock: endBlock
            });
            
            let processedCount = 0;
            let skippedCount = 0;
            
            // Parse events using contract interface (without logging)
            for (const event of events) {
              try {
                const parsedLog = contract.interface.parseLog(event);
                if (parsedLog) {
                  const processedEvent = await processEvent({
                    ...event,
                    fragment: parsedLog.fragment,
                    args: parsedLog.args
                  });
                  
                  if (processedEvent) {
                    allEventsInChunk.push(processedEvent);
                    processedCount++;
                  } else {
                    skippedCount++;
                  }
                } else {
                  skippedCount++;
                }
              } catch (eventError) {
                // Silent error handling
                skippedCount++;
              }
            }
            
          } catch (queryError) {
            console.error(`    Error querying events:`, queryError.message);
          }
          
          // Process all events without detailed logging
          for (const processedEvent of allEventsInChunk) {
            const eventType = processedEvent.eventType;
            totalEvents++;
            totalChunkEvents++;
            eventCounts[eventType]++;
            
            // Skip detailed event logging - too verbose
          }
          
          // Update last processed block for progress tracking
          lastProcessedBlock = endBlock;
          
          // Block range header
          console.log(`\n=== BLOCKS ${startBlock.toLocaleString()}-${endBlock.toLocaleString()} ===`);
          console.log(`Found ${totalChunkEvents} new events (total: ${totalEvents})`);
          
          // Calculate new events by type in this chunk
          const chunkCounts = {};
          eventTypes.forEach(type => {
            chunkCounts[type] = allEventsInChunk.filter(e => e.eventType === type).length;
          });
          
          // Display vertical table of ALL event types (running totals)
          console.log("\nEVENT TYPE SUMMARY:");
          console.log("╔════════════╦════════════╦════════════╗");
          console.log("║ EVENT TYPE ║ THIS CHUNK ║ TOTAL      ║");
          console.log("╠════════════╬════════════╬════════════╣");
          
          // Sort event types by total count (descending)
          const sortedTypes = eventTypes.sort((a, b) => eventCounts[b] - eventCounts[a]);
          
          for (const type of sortedTypes) {
            const chunkCount = chunkCounts[type] || 0;
            const totalTypeCount = eventCounts[type] || 0;
            const typePercent = totalEvents > 0 ? Math.round((totalTypeCount / totalEvents) * 100) : 0;
            
            const paddedType = type.padEnd(10);
            const paddedChunk = `${chunkCount}`.padStart(6);
            const paddedTotal = `${totalTypeCount} (${typePercent}%)`.padStart(10);
            
            console.log(`║ ${paddedType} ║ ${paddedChunk} ║ ${paddedTotal} ║`);
          }
          
          console.log("╚════════════╩════════════╩════════════╝");
          success = true;
        } catch (error) {
          const errorMessage = error.toString();
          // More focused rate limit detection
          const isTooManyRequests = 
            errorMessage.includes("Too Many Requests") || 
            errorMessage.includes("rate limit") || 
            errorMessage.includes("429") ||
            errorMessage.includes("exceeded") ||
            (error.code === "SERVER_ERROR" && errorMessage.includes("limit"));
          
          // Show detailed error info for debugging
          console.log(`\n===== ERROR DETAILS =====`);
          console.log(`Error type: ${error.constructor.name}`);
          console.log(`Error code: ${error.code || 'none'}`);
          console.log(`Error message: ${errorMessage}`);
          console.log(`Rate limit detected: ${isTooManyRequests}`);
          console.log(`========================\n`);
          
          if (isTooManyRequests && retryCount < MAX_RETRIES) {
            retryCount++;
            const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000;
            console.log(`  Rate limited. Waiting ${Math.round(delay/1000)} seconds before retry #${retryCount}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            console.error(`  Error scanning blocks ${startBlock} to ${endBlock}:`, errorMessage);
            // Move on after MAX_RETRIES
            success = true;
          }
        }
      }
      
      // Add the default delay between chunks to avoid overwhelming the RPC node (silently)
      await new Promise(resolve => setTimeout(resolve, DEFAULT_DELAY));
    }
  } finally {
    // Make sure we clear the interval even if there's an error
    clearInterval(statusInterval);
  }
  
  console.log('\n=============== FINAL RESULTS ===============');
  console.log(`SCAN COMPLETE: Found ${totalEvents} total events`);
  
  // Get event counts sorted by count (high to low)
  const typeEntries = Object.entries(eventCounts)
    .filter(([_, count]) => count > 0)  // Only show event types with non-zero counts
    .sort((a, b) => b[1] - a[1]);       // Sort by count descending
  
  if (typeEntries.length > 0) {
    // Simple table of non-zero counts
    console.log('Event counts:');
    typeEntries.forEach(([type, count]) => {
      const percentage = totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0;
      console.log(`  ${type.padEnd(10)}: ${count} (${percentage}%)`);
    });
  } else {
    console.log('No events found.');
  }
  
  console.log('=============================================');
}

// Run the scanner
scanEvents()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });