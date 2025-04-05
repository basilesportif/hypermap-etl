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
  const eventName = event.fragment?.name || '';
  const timestamp = await getBlockTimestamp(event.blockNumber);
  
  const baseEvent = {
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    transactionHash: event.transactionHash,
    transactionIndex: event.transactionIndex,
    logIndex: event.index, // ethers v6 uses index instead of logIndex
    timestamp
  };

  let eventData;
  
  switch(eventName) {
    case 'Mint': {
      const args = event.args;
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
      const args = event.args;
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
      const args = event.args;
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
      const args = event.args;
      eventData = {
        ...baseEvent,
        eventType: 'Gene',
        entry: args[0],
        gene: args[1]
      };
      break;
    }
    
    case 'Transfer': {
      const args = event.args;
      eventData = {
        ...baseEvent,
        eventType: 'Transfer',
        from: args[0],
        to: args[1],
        id: args[2].toString()
      };
      break;
    }
    
    case 'Zero': {
      const args = event.args;
      eventData = {
        ...baseEvent,
        eventType: 'Zero',
        zeroTba: args[0]
      };
      break;
    }
    
    case 'Upgraded': {
      const args = event.args;
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
  
  // Run periodic status updates
  const statusInterval = setInterval(() => {
    console.log("\n============ CURRENT STATUS ============");
    console.log(`Total events found so far: ${totalEvents}`);
    console.log("Event counts by type:");
    
    // Get sorted event types (with Transfer first, then alphabetical)
    const sortedTypes = Object.keys(eventCounts).sort((a, b) => {
      if (a === 'Transfer') return -1;
      if (b === 'Transfer') return 1;
      return a.localeCompare(b);
    });
    
    // Display counts in a clean format
    sortedTypes.forEach(type => {
      const count = eventCounts[type];
      const percentage = totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0;
      console.log(`  ${type.padEnd(10)}: ${count.toString().padStart(6)} (${percentage}%)`);
    });
    
    console.log("=========================================\n");
  }, 15000); // Print status more frequently (every 15 seconds)
  
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
            console.log(`    Querying for ALL events from contract...`);
            
            // Query without specific event filter to get ALL events
            const events = await contract.queryFilter({}, startBlock, endBlock);
            console.log(`    Found ${events.length} total events`);
            
            // Process and categorize events
            const eventsByType = {};
            eventTypes.forEach(type => { eventsByType[type] = 0 });
            
            for (const event of events) {
              const processedEvent = await processEvent(event);
              if (processedEvent) {
                allEventsInChunk.push(processedEvent);
                eventsByType[processedEvent.eventType] = (eventsByType[processedEvent.eventType] || 0) + 1;
              }
            }
            
            // Log counts by type
            console.log(`    Events by type in this chunk:`);
            for (const eventType of eventTypes) {
              console.log(`      ${eventType}: ${eventsByType[eventType] || 0}`);
            }
            
          } catch (queryError) {
            console.error(`    Error querying events:`, queryError.message);
          }
          
          // Process all events (now sorted by type)
          for (const processedEvent of allEventsInChunk) {
            const eventType = processedEvent.eventType;
            totalEvents++;
            totalChunkEvents++;
            eventCounts[eventType]++;
            
            // Format output based on event type
            if (eventType === 'Mint') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] MINT #${eventCounts['Mint']}: parent=${formatHex(processedEvent.parenthash)} child=${formatHex(processedEvent.childhash)} label="${processedEvent.label}"`);
            } else if (eventType === 'Fact') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] FACT #${eventCounts['Fact']}: parent=${formatHex(processedEvent.parenthash)} label="${processedEvent.label}" data="${processedEvent.data.substring(0, 30)}${processedEvent.data.length > 30 ? '...' : ''}"`);
            } else if (eventType === 'Note') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] NOTE #${eventCounts['Note']}: parent=${formatHex(processedEvent.parenthash)} label="${processedEvent.label}" data="${processedEvent.data.substring(0, 30)}${processedEvent.data.length > 30 ? '...' : ''}"`);
            } else if (eventType === 'Gene') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] GENE #${eventCounts['Gene']}: entry=${formatHex(processedEvent.entry)} gene=${formatHex(processedEvent.gene)}`);
            } else if (eventType === 'Transfer') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] TRANSFER #${eventCounts['Transfer']}: from=${formatHex(processedEvent.from)} to=${formatHex(processedEvent.to)} id=${formatHex(processedEvent.id)}`);
            } else if (eventType === 'Zero') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] ZERO #${eventCounts['Zero']}: tba=${formatHex(processedEvent.zeroTba)}`);
            } else if (eventType === 'Upgraded') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] UPGRADED #${eventCounts['Upgraded']}: implementation=${formatHex(processedEvent.implementation)}`);
            }
          }
          
          // Summary for this chunk
          console.log(`  Found ${totalChunkEvents} total events in this chunk`);
          
          // Print event counts by type for this chunk
          for (const eventType of eventTypes) {
            console.log(`    ${eventType}: ${allEventsInChunk.filter(e => e.eventType === eventType).length}`);
          }
          
          console.log(`  Running total: ${totalEvents} events so far`);
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
      
      // Add the default delay between chunks to avoid overwhelming the RPC node
      console.log(`  Waiting ${DEFAULT_DELAY}ms before next chunk...`);
      await new Promise(resolve => setTimeout(resolve, DEFAULT_DELAY));
    }
  } finally {
    // Make sure we clear the interval even if there's an error
    clearInterval(statusInterval);
  }
  
  console.log('\n=============== FINAL RESULTS ===============');
  console.log('Scan completed!');
  console.log(`Total events: ${totalEvents}`);
  console.log('Final event counts by type:');
  
  // Get sorted event types (with Transfer first, then alphabetical)
  const sortedTypes = Object.keys(eventCounts).sort((a, b) => {
    if (a === 'Transfer') return -1;
    if (b === 'Transfer') return 1;
    return a.localeCompare(b);
  });
  
  // Calculate the maximum count for bar chart scaling
  const maxCount = Math.max(...Object.values(eventCounts));
  const barLength = 30; // Maximum bar length
    
  // Display counts in a clean format with bar chart
  sortedTypes.forEach(type => {
    const count = eventCounts[type];
    const percentage = totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0;
    const barSize = Math.round((count / maxCount) * barLength);
    const bar = '█'.repeat(barSize);
    
    console.log(`  ${type.padEnd(10)}: ${count.toString().padStart(6)} (${percentage.toString().padStart(2)}%) ${bar}`);
  });
  
  console.log('=============================================');
}

// Run the scanner
scanEvents()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });