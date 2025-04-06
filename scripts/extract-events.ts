/**
 * HyperMap Event Extractor
 * Usage: npm run extract-events -- --from=27270000 [--to=27280000]
 * 
 * Options:
 *   --from=<block>     Starting block number (defaults to 27270000)
 *   --to=<block>       Ending block number (defaults to 'latest')
 * 
 * Scans for events from the HyperMap contract on Base within the specified block range
 * and stores ONLY the events in the database (no entry processing).
 * Uses event ID as MongoDB _id for upsert support.
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
import { HypermapEvent } from '../src/types/index.js';

// Fix for null prototype errors with Mongoose
(mongoose.Types.ObjectId as any).prototype[Symbol.for('nodejs.util.inspect.custom')] = function() {
  return `new ObjectId("${this}")`;
};

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

// Always extract all event types
const eventTypes = ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'];
console.log("Extracting ALL event types");

// Parse arguments
args.forEach(arg => {
  if (arg.startsWith('--from=')) {
    fromBlock = parseInt(arg.split('=')[1]);
  } else if (arg.startsWith('--to=')) {
    const value = arg.split('=')[1];
    toBlock = value === 'latest' ? 'latest' : parseInt(value);
  }
});

// Setup provider and contract
const provider = createProvider(process.env.BASE_RPC_URL as string);
const contract = createContract(provider);

// Modified schema to use event-specific ID as _id
const HypermapEventSchema = new mongoose.Schema({
  // Base event fields
  eventType: { type: String, required: true, index: true, enum: ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'] },
  blockNumber: { type: Number, required: true, index: true },
  blockHash: { type: String, required: true }, // Bytes32
  transactionHash: { type: String, required: true, index: true }, // Bytes32
  transactionIndex: { type: Number, required: true },
  logIndex: { type: Number, required: true },
  timestamp: { type: Number }, // Optional
  
  // Mint event fields - bytes32 (indexed)
  parenthash: { type: String, sparse: true, index: true }, // Bytes32
  childhash: { type: String, sparse: true, index: true },  // Bytes32
  
  // Fact/Note event fields - bytes32 (indexed)
  facthash: { type: String, sparse: true, index: true },  // Bytes32
  notehash: { type: String, sparse: true, index: true },  // Bytes32
  
  // Common fields for various events
  labelhash: { type: String, sparse: true, index: true }, // Bytes (indexed) - hex string of raw bytes
  label: { type: String, sparse: true, index: true },     // String - UTF8 decoded from bytes
  data: { type: String, sparse: true },                   // Bytes - hex string of raw bytes
  
  // Gene event fields
  entry: { type: String, sparse: true, index: true },     // Bytes32 (indexed)
  gene: { type: String, sparse: true, index: true },      // Address (indexed)
  
  // Transfer event fields
  from: { type: String, sparse: true, index: true },      // Address (indexed)
  to: { type: String, sparse: true, index: true },        // Address (indexed)
  id: { type: String, sparse: true, index: true },        // uint256 (indexed) as string
  
  // Zero event fields
  zeroTba: { type: String, sparse: true, index: true },   // Address (indexed)
  
  // Upgraded event fields
  implementation: { type: String, sparse: true, index: true } // Address (indexed)
}, { 
  timestamps: true,
  _id: false // Disable automatic _id
});

// Create or retrieve the model with _id coming from event data
// Check if model exists first to avoid model overwrite issues
let HypermapEventModel;
try {
  // Try to get existing model first
  HypermapEventModel = mongoose.model('HypermapEvent');
  console.log('Using existing HypermapEvent model');
  
  // Don't attempt to override the schema - can cause null prototype errors
  // Instead use the existing model as is
  console.log('Using existing HypermapEvent model without recompilation');
} catch (error) {
  // Model doesn't exist yet, create it
  HypermapEventModel = mongoose.model<HypermapEvent & mongoose.Document>(
    'HypermapEvent', 
    HypermapEventSchema
  );
  console.log('Created new HypermapEvent model');
}

// Generate a unique ID for each event based on its properties
function generateEventId(event: HypermapEvent): string {
  return `${event.transactionHash}_${event.logIndex}`;
}

// Store events in MongoDB with _id as the event-specific ID
async function storeEvents(events: HypermapEvent[]): Promise<void> {
  if (!events.length) return;
  
  try {
    // Prepare events with _id field set to event-specific ID
    const eventsWithId = events.map(event => {
      const eventWithId = {
        ...event,
        _id: generateEventId(event)
      };
      return eventWithId;
    });
    
    // Insert events with upsert strategy
    const operations = eventsWithId.map(event => ({
      updateOne: {
        filter: { _id: event._id },
        update: event,
        upsert: true
      }
    }));

    console.log('Executing MongoDB bulkWrite with upsert operations...');
    
    // Log the first operation for debugging
    if (operations.length > 0) {
      console.log('Sample operation:', JSON.stringify(operations[0]).substring(0, 200) + '...');
    }
    
    const result = await HypermapEventModel.bulkWrite(operations, { ordered: false });
    
    console.log(`MongoDB result: ${JSON.stringify(result)}`);
    console.log(`Stored ${result.upsertedCount} new events, updated ${result.modifiedCount} existing events`);
    
    // Try direct insert if bulk operation didn't work
    if (result.upsertedCount === 0 && result.modifiedCount === 0) {
      console.log('Warning: No events were stored. Trying direct inserts as fallback...');
      
      // Try direct insert of each record individually
      if (eventsWithId.length > 0) {
        console.log(`Attempting direct insert of ${eventsWithId.length} records one by one...`);
        let successCount = 0;
        
        for (const event of eventsWithId) {
          try {
            // Use insertOne instead of create to avoid schema issues
            await mongoose.connection.db.collection('hypermapevents').updateOne(
              { _id: event._id },
              { $set: event },
              { upsert: true }
            );
            successCount++;
          } catch (err) {
            console.error(`Failed to insert event ${event._id}:`, err);
          }
        }
        
        console.log(`Direct insert completed: ${successCount}/${eventsWithId.length} successful`);
      }
    }
  } catch (error: any) {
    // Handle duplicate key errors
    if (error.code === 11000) {
      console.log(`Some events already exist in database, skipped duplicates`);
    } else {
      console.error(`Error storing events:`, error);
    }
  }
}

// Main extractor function
async function extractEvents() {
  console.log(`Starting event extraction from block ${fromBlock} to ${toBlock}`);
  console.log(`Extracting events: ${eventTypes.join(', ')}`);
  console.log(`Contract address: ${CONTRACT_ADDRESS}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI}`);
  console.log(`RPC URL: ${process.env.BASE_RPC_URL}`);
  console.log('----------------------------------------');
  
  // Connect to MongoDB
  try {
    console.log(`Connecting to MongoDB at ${process.env.MONGODB_URI}`);
    await mongoose.connect(process.env.MONGODB_URI as string, {
      // Add connection options to ensure we're using the latest Mongoose features
      autoCreate: true, // Automatically create collections
    });
    console.log('Connected to MongoDB successfully');
    
    // Test database connection by checking collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`Available collections: ${collections.map(c => c.name).join(', ')}`);
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
            // Query with filter by contract address
            const allEventsFilter = { address: CONTRACT_ADDRESS };
            const events = await provider.getLogs({
              ...allEventsFilter,
              fromBlock: startBlock,
              toBlock: endBlock
            });
            
            // Parse logs to structured events
            const processedEvents = await parseLogsToEvents(events, contract, provider);
            allProcessedEvents.push(...processedEvents);
          } catch (queryError) {
            console.error(`    Error querying events:`, (queryError as Error).message);
          }
          
          // Count events by type
          for (const processedEvent of allProcessedEvents) {
            const eventType = processedEvent.eventType;
            totalEvents++;
            totalChunkEvents++;
            eventCounts[eventType]++;
          }
          
          // Store events in database
          if (allProcessedEvents.length > 0) {
            console.log(`Storing ${allProcessedEvents.length} events in database...`);
            await storeEvents(allProcessedEvents);
          } else {
            console.log('No events to store in this chunk');
          }
          
          // Update last processed block for progress tracking
          lastProcessedBlock = endBlock;
          
          // Block range header
          console.log(`\n=== BLOCKS ${startBlock.toLocaleString()}-${endBlock.toLocaleString()} ===`);
          console.log(`Found ${totalChunkEvents} events (total: ${totalEvents})`);
          
          // Calculate events by type in this chunk
          const chunkCounts: Record<string, number> = {};
          eventTypes.forEach(type => {
            chunkCounts[type] = allProcessedEvents.filter(e => e.eventType === type).length;
          });
          
          // Display summary table
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
          // Rate limit detection
          const isTooManyRequests = 
            errorMessage.includes("Too Many Requests") || 
            errorMessage.includes("rate limit") || 
            errorMessage.includes("429") ||
            errorMessage.includes("exceeded") ||
            ((error as any).code === "SERVER_ERROR" && errorMessage.includes("limit"));
          
          // Show error details
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
      
      // Add delay between chunks
      await new Promise(resolve => setTimeout(resolve, DEFAULT_DELAY));
    }
  } finally {
    // Make sure we clear the interval even if there's an error
    clearInterval(statusInterval);
  }
  
  console.log('\n=============== FINAL RESULTS ===============');
  console.log(`EXTRACTION COMPLETE: Found ${totalEvents} total events`);
  
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

// Run the extractor
extractEvents()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });