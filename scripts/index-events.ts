/**
 * HyperMap Event Indexer
 * Usage: npm run index-events -- --from=27270000 [--to=27280000] [--print]
 * 
 * Options:
 *   --from=<block>     Starting block number (defaults to 27270000)
 *   --to=<block>       Ending block number (defaults to 'latest')
 *   --print            Only print events, don't store in database
 * 
 * Scans for events from the HyperMap contract on Base within the specified block range
 * and stores them in the database.
 */

// Import libraries
import { ethers } from 'ethers';
import mongoose from 'mongoose';
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
import {
  initMongoConnection,
  storeEvents,
  processEventsToEntries
} from '../src/lib/services/mongodb.js';
import { HypermapEvent } from '../src/types/index.js';

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

if (!process.env.MONGODB_URI) {
  console.error('Error: MONGODB_URI is not defined in .env or .env.local file');
  process.exit(1);
}

// Constants
const DEFAULT_START_BLOCK = 27270000; // First block of HyperMap deployment

// Parse command line arguments
const args = process.argv.slice(2);
let fromBlock = DEFAULT_START_BLOCK;
let toBlock: number | 'latest' = 'latest';
let onlyPrint = false;

// Always index all event types
const eventTypes = ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'];
console.log("Indexing ALL event types regardless of command line arguments");

// Parse arguments
args.forEach(arg => {
  if (arg.startsWith('--from=')) {
    fromBlock = parseInt(arg.split('=')[1]);
  } else if (arg.startsWith('--to=')) {
    const value = arg.split('=')[1];
    toBlock = value === 'latest' ? 'latest' : parseInt(value);
  } else if (arg === '--print') {
    onlyPrint = true;
  }
});

// Setup provider and contract
const provider = createProvider(process.env.BASE_RPC_URL as string);
const contract = createContract(provider);

// Store events in the database (wrapper for print-only mode)
async function storeEventsWithPrintMode(events: HypermapEvent[]) {
  if (events.length === 0) return;
  
  if (onlyPrint) {
    console.log(`Would store ${events.length} events (--print flag is active, not actually storing)`);
    return;
  }
  
  await storeEvents(events);
}

// Main indexer function
async function indexEvents() {
  console.log(`Starting event indexing from block ${fromBlock} to ${toBlock}`);
  console.log(`Indexing events: ${eventTypes.join(', ')}`);
  console.log(`Contract address: ${CONTRACT_ADDRESS}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI}`);
  console.log(`RPC URL: ${process.env.BASE_RPC_URL}`);
  console.log(`Print only mode: ${onlyPrint ? 'Yes' : 'No'}`);
  console.log('----------------------------------------');
  
  // Connect to MongoDB using our service
  try {
    await initMongoConnection(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
  
  let eventCounts: Record<string, number> = {};
  let totalEvents = 0;
  eventTypes.forEach(type => { eventCounts[type] = 0 });
  
  if (toBlock === 'latest') {
    const latestBlock = await provider.getBlockNumber();
    console.log(`Latest block: ${latestBlock}`);
    toBlock = latestBlock;
  }
  
  // Calculate the number of blocks
  const blockCount = (toBlock as number) - fromBlock + 1;
  console.log(`Scanning ${blockCount.toLocaleString()} blocks`);
  
  // Define chunk size and rate limiting parameters
  const CHUNK_SIZE = 5000; // Reduce to 5k blocks for fewer rate limits
  const DEFAULT_DELAY = 2000; // Increase default delay to 2 seconds
  const MAX_RETRIES = 5;
  const BASE_RETRY_DELAY = 3000; // 3 seconds for exponential backoff
  
  // Run simple periodic status updates
  const statusInterval = setInterval(() => {
    // Simple one-line status update
    const blocksProcessed = Math.min(toBlock as number, lastProcessedBlock || fromBlock) - fromBlock;
    const blockCompletion = blockCount > 0 ? Math.round((blocksProcessed / blockCount) * 100) : 0;
    console.log(`STATUS: ${totalEvents} events found (${blockCompletion}% complete)`);
  }, 15000); // Update every 15 seconds
  
  // Track the last processed block to calculate progress
  let lastProcessedBlock = fromBlock;
  
  try {
    // Process in chunks of blocks
    for (let startBlock = fromBlock; startBlock <= (toBlock as number); startBlock += CHUNK_SIZE) {
      const endBlock = Math.min(startBlock + CHUNK_SIZE - 1, toBlock as number);
      let retryCount = 0;
      let success = false;
      
      console.log(`\nScanning blocks ${startBlock.toLocaleString()} to ${endBlock.toLocaleString()}...`);
      
      while (!success && retryCount <= MAX_RETRIES) {
        try {
          // Scan for all event types at once
          let totalChunkEvents = 0;
          let allProcessedEvents: HypermapEvent[] = [];
          
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
            allProcessedEvents.push(...processedEvents);
            
            // Update counters
            processedCount = processedEvents.length;
            skippedCount = events.length - processedCount;
            
          } catch (queryError) {
            console.error(`    Error querying events:`, (queryError as Error).message);
          }
          
          // Process all events without detailed logging
          for (const processedEvent of allProcessedEvents) {
            const eventType = processedEvent.eventType;
            totalEvents++;
            totalChunkEvents++;
            eventCounts[eventType]++;
            
            // Skip detailed event logging - too verbose
          }
          
          // Store events in database
          if (allProcessedEvents.length > 0) {
            await storeEventsWithPrintMode(allProcessedEvents);
            
            // Process events to update entries
            if (!onlyPrint) {
              await processEventsToEntries(allProcessedEvents);
            }
          }
          
          // Update last processed block for progress tracking
          lastProcessedBlock = endBlock;
          
          // Block range header
          console.log(`\n=== BLOCKS ${startBlock.toLocaleString()}-${endBlock.toLocaleString()} ===`);
          console.log(`Found ${totalChunkEvents} new events (total: ${totalEvents})`);
          
          // Calculate new events by type in this chunk
          const chunkCounts: Record<string, number> = {};
          eventTypes.forEach(type => {
            chunkCounts[type] = allProcessedEvents.filter(e => e.eventType === type).length;
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
  } finally {
    // Make sure we clear the interval even if there's an error
    clearInterval(statusInterval);
  }
  
  console.log('\n=============== FINAL RESULTS ===============');
  console.log(`INDEXING COMPLETE: Found ${totalEvents} total events`);
  
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
  
  // Disconnect from MongoDB
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

// Run the indexer
indexEvents()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });