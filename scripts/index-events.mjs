/**
 * HyperMap Event Indexer
 * Usage: npm run index-events -- --from=27270000 --to=27280000
 * 
 * Scans for events from the HyperMap contract on Base within the specified block range
 * and stores them in the database.
 */

// Import libraries
import { ethers } from 'ethers';
import mongoose from 'mongoose';
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

if (!process.env.MONGODB_URI) {
  console.error('Error: MONGODB_URI is not defined in .env or .env.local file');
  process.exit(1);
}

// Contract constants
const CONTRACT_ADDRESS = '0x000000000044C6B8Cb4d8f0F889a3E47664EAeda';
const DEFAULT_START_BLOCK = 27270000; // First block of HyperMap deployment

// Parse command line arguments
const args = process.argv.slice(2);
let fromBlock = DEFAULT_START_BLOCK;
let toBlock = 'latest';
let eventTypes = ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'];
let onlyPrint = false;

// Parse arguments
args.forEach(arg => {
  if (arg.startsWith('--from=')) {
    fromBlock = parseInt(arg.split('=')[1]);
  } else if (arg.startsWith('--to=')) {
    const value = arg.split('=')[1];
    toBlock = value === 'latest' ? 'latest' : parseInt(value);
  } else if (arg.startsWith('--events=')) {
    eventTypes = arg.split('=')[1].split(',');
  } else if (arg === '--print') {
    onlyPrint = true;
  }
});

// Load ABI from file
const hypermapAbiPath = path.resolve(rootDir, 'src/abi/hypermap.abi.json');
const hypermapAbi = JSON.parse(fs.readFileSync(hypermapAbiPath, 'utf8'));

// Setup provider and contract
const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, hypermapAbi, provider);

// Define Mongoose schema
const HypermapEventSchema = new mongoose.Schema({
  eventType: { type: String, required: true, index: true },
  blockNumber: { type: Number, required: true, index: true },
  blockHash: { type: String, required: true },
  transactionHash: { type: String, required: true, index: true },
  transactionIndex: { type: Number, required: true },
  logIndex: { type: Number, required: true },
  timestamp: { type: Number },
  
  // Mint event fields
  parenthash: { type: String, sparse: true, index: true },
  childhash: { type: String, sparse: true, index: true },
  
  // Fact/Note event fields
  facthash: { type: String, sparse: true },
  notehash: { type: String, sparse: true },
  
  // Common fields
  labelhash: { type: String, sparse: true },
  label: { type: String, sparse: true, index: true },
  data: { type: String, sparse: true },
  
  // Gene event fields
  entry: { type: String, sparse: true, index: true },
  gene: { type: String, sparse: true },
  
  // Transfer event fields
  from: { type: String, sparse: true, index: true },
  to: { type: String, sparse: true, index: true },
  id: { type: String, sparse: true },
  
  // Zero event fields
  zeroTba: { type: String, sparse: true },
  
  // Upgraded event fields
  implementation: { type: String, sparse: true }
}, { 
  timestamps: true 
});

// Create models
let HypermapEventModel;

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

// Store events in the database
async function storeEvents(events) {
  if (events.length === 0) return;
  
  if (onlyPrint) {
    console.log(`Would store ${events.length} events (--print flag is active, not actually storing)`);
    return;
  }
  
  try {
    await HypermapEventModel.insertMany(events, { ordered: false });
    console.log(`  Stored ${events.length} events in the database`);
  } catch (error) {
    // Handle duplicate key errors
    if (error.code === 11000) {
      console.log(`  Some events already exist in the database, continuing...`);
    } else {
      console.error(`  Error storing events:`, error);
    }
  }
}

// Main indexer function
async function indexEvents() {
  console.log(`Starting event indexing from block ${fromBlock} to ${toBlock}`);
  console.log(`Indexing events: ${eventTypes.join(', ')}`);
  console.log(`Contract address: ${CONTRACT_ADDRESS}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI.substring(0, 20)}...`);
  console.log(`RPC URL: ${process.env.BASE_RPC_URL.substring(0, 20)}...`);
  console.log(`Print only mode: ${onlyPrint ? 'Yes' : 'No'}`);
  console.log('----------------------------------------');
  
  // Connect to MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Create model
    HypermapEventModel = mongoose.models.HypermapEvent || mongoose.model('HypermapEvent', HypermapEventSchema);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
  
  let eventCounts = {};
  let totalEvents = 0;
  
  if (toBlock === 'latest') {
    const latestBlock = await provider.getBlockNumber();
    console.log(`Latest block: ${latestBlock}`);
    toBlock = latestBlock;
  }
  
  // Calculate the number of blocks
  const blockCount = toBlock - fromBlock + 1;
  console.log(`Scanning ${blockCount.toLocaleString()} blocks`);
  
  // Define chunk size based on block count
  const CHUNK_SIZE = 5000;
  
  // Process in chunks
  for (let i = 0; i < eventTypes.length; i++) {
    const eventType = eventTypes[i];
    eventCounts[eventType] = 0;
    
    console.log(`\nIndexing ${eventType} events...`);
    
    // Process in chunks of blocks
    for (let startBlock = fromBlock; startBlock <= toBlock; startBlock += CHUNK_SIZE) {
      const endBlock = Math.min(startBlock + CHUNK_SIZE - 1, toBlock);
      
      try {
        console.log(`  Scanning blocks ${startBlock.toLocaleString()} to ${endBlock.toLocaleString()}...`);
        
        const filter = contract.filters[eventType]();
        const events = await contract.queryFilter(filter, startBlock, endBlock);
        console.log(`  Found ${events.length} ${eventType} events in this chunk`);
        
        if (events.length === 0) continue;
        
        // Process events
        const processedEvents = [];
        
        for (const event of events) {
          const processedEvent = await processEvent(event);
          if (processedEvent) {
            totalEvents++;
            eventCounts[eventType]++;
            processedEvents.push(processedEvent);
            
            // Print event details
            if (processedEvent.eventType === 'Mint') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] MINT: parent=${formatHex(processedEvent.parenthash)} child=${formatHex(processedEvent.childhash)} label="${processedEvent.label}"`);
            } else if (processedEvent.eventType === 'Fact') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] FACT: parent=${formatHex(processedEvent.parenthash)} label="${processedEvent.label}" data="${processedEvent.data.substring(0, 30)}${processedEvent.data.length > 30 ? '...' : ''}"`);
            } else if (processedEvent.eventType === 'Note') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] NOTE: parent=${formatHex(processedEvent.parenthash)} label="${processedEvent.label}" data="${processedEvent.data.substring(0, 30)}${processedEvent.data.length > 30 ? '...' : ''}"`);
            } else if (processedEvent.eventType === 'Gene') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] GENE: entry=${formatHex(processedEvent.entry)} gene=${formatHex(processedEvent.gene)}`);
            } else if (processedEvent.eventType === 'Transfer') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] TRANSFER: from=${formatHex(processedEvent.from)} to=${formatHex(processedEvent.to)} id=${formatHex(processedEvent.id)}`);
            } else if (processedEvent.eventType === 'Zero') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] ZERO: tba=${formatHex(processedEvent.zeroTba)}`);
            } else if (processedEvent.eventType === 'Upgraded') {
              console.log(`[${formatTimestamp(processedEvent.timestamp)}] UPGRADED: implementation=${formatHex(processedEvent.implementation)}`);
            }
          }
        }
        
        // Store events in batches
        if (processedEvents.length > 0) {
          await storeEvents(processedEvents);
        }
      } catch (error) {
        console.error(`  Error indexing ${eventType} events from block ${startBlock} to ${endBlock}:`, error.message);
      }
      
      // Add a small delay to avoid overwhelming the RPC node
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log('\n----------------------------------------');
  console.log('Indexing completed!');
  console.log('Event counts:');
  for (const [type, count] of Object.entries(eventCounts)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log(`Total events: ${totalEvents}`);
  
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