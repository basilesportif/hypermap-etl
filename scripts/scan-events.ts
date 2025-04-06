/**
 * HyperMap Event Scanner
 * Usage: npm run scan-events -- --from=27270000 [--to=27280000] [--continuous]
 * 
 * Options:
 *   --from=<block>     Starting block number (defaults to 27270000)
 *   --to=<block>       Ending block number (defaults to 'latest')
 *   --continuous, -c   Keep scanning for new blocks after reaching latest block
 * 
 * Scans for events from the HyperMap contract on Base within the specified block range
 * and prints them to the console. Does not store them in the database.
 * 
 * In continuous mode, the scanner will wait for new blocks after catching up to the chain head.
 */

// Import libraries
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createProvider,
  createContract,
  parseLogsToEvents,
  formatTimestamp,
  formatHex,
  CONTRACT_ADDRESS
} from '../src/lib/services/events.js';

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

// Constants
const DEFAULT_START_BLOCK = 27270000; // First block of HyperMap deployment

// Parse command line arguments
const args = process.argv.slice(2);
let fromBlock = DEFAULT_START_BLOCK;
let toBlock: number | 'latest' = 'latest';

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
  // Continuous mode flags are handled directly in the scanEvents function
});

// Setup provider and contract
const provider = createProvider(process.env.BASE_RPC_URL as string);
const contract = createContract(provider);

// Main scanner function
async function scanEvents() {
  // Create command line flag for continuous mode
  const isContinuous = args.includes('--continuous') || args.includes('-c');
  
  console.log(`Starting event scan from block ${fromBlock}`);
  if (isContinuous) {
    console.log('CONTINUOUS MODE: Will keep scanning until reaching the head of the chain');
  } else if (toBlock === 'latest') {
    console.log('Will scan until the latest block');
  } else {
    console.log(`Will scan until block ${toBlock}`);
  }
  
  console.log(`Scanning for events: ${eventTypes.join(', ')}`);
  console.log(`Contract address: ${CONTRACT_ADDRESS}`);
  console.log(`RPC URL: ${process.env.BASE_RPC_URL}`);
  console.log('----------------------------------------');
  
  let eventCounts: Record<string, number> = {};
  let totalEvents = 0;
  eventTypes.forEach(type => { eventCounts[type] = 0 });
  
  // Get the latest block first
  let latestBlock = await provider.getBlockNumber();
  console.log(`Current chain head is at block: ${latestBlock}`);
  
  // If 'latest' or continuous mode, use the current latest block
  if (toBlock === 'latest') {
    toBlock = latestBlock;
  }
  
  // Calculate the initial number of blocks
  let blockCount = toBlock - fromBlock + 1;
  console.log(`Scanning ${blockCount.toLocaleString()} blocks initially`);
  
  // Define chunk size and rate limiting parameters
  const CHUNK_SIZE = 5000; // Reduce to 5k blocks for fewer rate limits
  const DEFAULT_DELAY = 2000; // Increase default delay to 2 seconds
  const MAX_RETRIES = 5;
  const BASE_RETRY_DELAY = 3000; // 3 seconds for exponential backoff
  
  // For continuous mode, we'll check for new blocks at this interval
  const CHAIN_HEAD_CHECK_INTERVAL = 30000; // 30 seconds
  
  // Run simple periodic status updates
  const statusInterval = setInterval(() => {
    // Simple one-line status update
    const blocksProcessed = Math.min(toBlock as number, lastProcessedBlock || fromBlock) - fromBlock;
    const blockCompletion = blockCount > 0 ? Math.round((blocksProcessed / blockCount) * 100) : 0;
    console.log(`STATUS: ${totalEvents} events found (${blockCompletion}% complete)`);
  }, 15000); // Update every 15 seconds
  
  // Track the last processed block to calculate progress
  let lastProcessedBlock = fromBlock;
  
  // Keep track of the initial start and end blocks for continuous mode
  let currentStartBlock = fromBlock;
  let continuousModeActive = isContinuous;
  
  try {
    // Outer loop for continuous mode
    do {
      // If in continuous mode and we've caught up, wait and check for new blocks
      if (continuousModeActive && currentStartBlock > (toBlock as number)) {
        console.log(`\nCaught up to block ${toBlock}, waiting for new blocks...`);
        await new Promise(resolve => setTimeout(resolve, CHAIN_HEAD_CHECK_INTERVAL));
        
        // Check for new blocks
        const newLatestBlock = await provider.getBlockNumber();
        if (newLatestBlock > latestBlock) {
          console.log(`\nNew blocks detected! Chain head moved from ${latestBlock} to ${newLatestBlock}`);
          latestBlock = newLatestBlock;
          toBlock = newLatestBlock;
          
          // Update block count
          blockCount = (toBlock as number) - fromBlock + 1;
          console.log(`Total blocks to scan: ${blockCount.toLocaleString()}`);
        } else {
          console.log(`No new blocks detected (still at ${latestBlock}), continuing to wait...`);
          continue; // Skip to the next iteration of the outer loop
        }
      }
      
      // Process in chunks of blocks
      for (let startBlock = currentStartBlock; startBlock <= (toBlock as number); startBlock += CHUNK_SIZE) {
        const endBlock = Math.min(startBlock + CHUNK_SIZE - 1, toBlock as number);
        let retryCount = 0;
        let success = false;
        
        console.log(`\nScanning blocks ${startBlock.toLocaleString()} to ${endBlock.toLocaleString()}...`);
        
        // Update where we'll start from in the next continuous mode cycle
        currentStartBlock = endBlock + 1;
        
        while (!success && retryCount <= MAX_RETRIES) {
          try {
            // Scan for all event types at once
            let totalChunkEvents = 0;
            
            // Create an array to hold all events from all types
            let allEventsInChunk: any[] = [];
            
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
              
              // Parse logs to structured events using our events service
              const processedEvents = await parseLogsToEvents(events, contract, provider);
              allEventsInChunk.push(...processedEvents);
              
              // Update counters
              processedCount = processedEvents.length;
              skippedCount = events.length - processedCount;
              
            } catch (queryError) {
              console.error(`    Error querying events:`, (queryError as Error).message);
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
            const chunkCounts: Record<string, number> = {};
            eventTypes.forEach(type => {
              chunkCounts[type] = allEventsInChunk.filter(e => e.eventType === type).length;
            });
            
            // Display vertical table of ALL event types (running totals)
            console.log("\nEVENT TYPE SUMMARY:");
            console.log("╔════════════╦════════════╦════════════╗");
            console.log("║ EVENT TYPE ║ THIS CHUNK ║ TOTAL      ║");
            console.log("╠════════════╬════════════╬════════════╣");
            
            // Sort event types by total count (descending)
            const sortedTypes = [...eventTypes].sort((a, b) => eventCounts[b] - eventCounts[a]);
            
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
            const errorMessage = (error as Error).toString();
            // More focused rate limit detection
            const isTooManyRequests = 
              errorMessage.includes("Too Many Requests") || 
              errorMessage.includes("rate limit") || 
              errorMessage.includes("429") ||
              errorMessage.includes("exceeded") ||
              ((error as any).code === "SERVER_ERROR" && errorMessage.includes("limit"));
            
            // Show detailed error info for debugging
            console.log(`\n===== ERROR DETAILS =====`);
            console.log(`Error type: ${(error as Error).constructor.name}`);
            console.log(`Error code: ${(error as any).code || 'none'}`);
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
      
      // If we're not in continuous mode, break out of the outer loop
      if (!continuousModeActive) {
        break;
      }
      
    } while (continuousModeActive); // Keep looping in continuous mode
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