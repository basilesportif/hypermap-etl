'use server';

import { ethers } from 'ethers';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import { 
  createProvider, 
  createContract, 
  parseLogsToEvents, 
  CONTRACT_ADDRESS 
} from '../lib/services/events';
import { HypermapEvent } from '../types';
import { HypermapEventModel } from '../models';
import { initMongoConnection } from '../lib/services/mongodb';

// Constants
const CHUNK_SIZE = 20000; // Process 20k blocks at a time
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 3000; // 3 seconds for exponential backoff

interface StatusResponse {
  status: 'running' | 'completed' | 'error';
  message: string;
  progress: {
    fromBlock: number;
    toBlock: number;
    currentBlock: number;
    completion: number;
  };
  events: {
    total: number;
    newInChunk: number;
    byType: {
      type: string;
      count: number;
      percentage: number;
    }[];
  };
  nextStartBlock?: number;
  error?: string;
}

interface EventCount {
  type: string;
  count: number;
  percentage: number;
}

// Get status data from the database
export async function getStatus() {
  // Initialize MongoDB connection if not already connected
  if (mongoose.connection.readyState !== 1) {
    await initMongoConnection(process.env.MONGODB_URI as string);
  }
  
  try {
    // 1. Count events by type
    const eventTypes = ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'];
    const eventCountsPromises = eventTypes.map(async (type) => {
      const count = await HypermapEventModel.countDocuments({ eventType: type });
      return { type, count };
    });
    
    const eventCounts = await Promise.all(eventCountsPromises);
    
    // Calculate total events
    const totalEvents = eventCounts.reduce((sum, { count }) => sum + count, 0);
    
    // Sort by count (descending) and add percentage
    const byType: EventCount[] = eventCounts
      .sort((a, b) => b.count - a.count)
      .map(({ type, count }) => ({
        type,
        count,
        percentage: totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0
      }));
    
    // 3. Get last block processed
    const lastEvent = await HypermapEventModel.findOne()
      .sort({ blockNumber: -1 })
      .select('blockNumber timestamp')
      .lean();
    
    let lastBlock = 0;
    let lastBlockTime = new Date().toISOString();
    let hoursAgo = 0;
    
    if (lastEvent) {
      lastBlock = lastEvent.blockNumber;
      
      if (lastEvent.timestamp) {
        const lastBlockDate = new Date(lastEvent.timestamp * 1000);
        lastBlockTime = lastBlockDate.toISOString();
        
        const now = new Date();
        const diffMs = now.getTime() - lastBlockDate.getTime();
        hoursAgo = Math.round(diffMs / (1000 * 60 * 60));
      }
    }
    
    // Return the status data
    return {
      events: {
        total: totalEvents,
        byType
      },
      processing: {
        lastBlock,
        lastBlockTime,
        hoursAgo
      }
    };
  } catch (error) {
    console.error('Error getting status:', error);
    throw new Error('Failed to get status data');
  }
}

// Generate a unique ID for each event based on its properties
function generateEventId(event: HypermapEvent): string {
  return `${event.transactionHash}_${event.logIndex}`;
}

// Store events in MongoDB with _id as the event-specific ID
async function storeEvents(events: HypermapEvent[], collection: any): Promise<{
  upsertedCount: number;
  modifiedCount: number;
}> {
  if (!events.length) {
    return { upsertedCount: 0, modifiedCount: 0 };
  }
  
  try {
    // Prepare events with _id field
    const eventsWithId = events.map(event => ({
      ...event,
      _id: generateEventId(event)
    }));
    
    // Use bulkWrite with updateOne operations (upsert)
    const operations = eventsWithId.map(event => ({
      updateOne: {
        filter: { _id: event._id },
        update: { $set: event },
        upsert: true
      }
    }));
    
    const result = await collection.bulkWrite(operations, { ordered: false });
    
    return {
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount
    };
  } catch (error: any) {
    // Handle duplicate key errors
    if (error.code === 11000) {
      console.log(`Some events already exist in database, skipped duplicates`);
      return { upsertedCount: 0, modifiedCount: 0 };
    } else {
      throw error;
    }
  }
}

// Extract events for a single chunk of blocks
export async function extractEvents(
  startBlock: number,
  endBlock: number | 'latest'
): Promise<StatusResponse> {
  try {
    // Initialize MongoDB connection
    let client: MongoClient | null = null;
    let db: any = null;
    let collection: any = null;
    
    // Connect to MongoDB using native driver
    client = new MongoClient(process.env.MONGODB_URI as string);
    await client.connect();
    
    db = client.db(); // Get default database
    collection = db.collection('hypermapevents');
    
    // Setup provider and contract
    const provider = createProvider(process.env.BASE_RPC_URL as string);
    const contract = createContract(provider);
    
    // Resolve latest block if needed
    let resolvedEndBlock: number;
    if (endBlock === 'latest') {
      resolvedEndBlock = await provider.getBlockNumber();
    } else {
      resolvedEndBlock = endBlock;
    }
    
    // Ensure end block is not before start block
    if (resolvedEndBlock < startBlock) {
      await client.close();
      return {
        status: 'error',
        message: 'End block cannot be before start block',
        progress: {
          fromBlock: startBlock,
          toBlock: resolvedEndBlock,
          currentBlock: startBlock,
          completion: 0
        },
        events: {
          total: 0,
          newInChunk: 0,
          byType: []
        },
        error: 'Invalid block range'
      };
    }
    
    // Calculate final end block for this chunk
    const chunkEndBlock = Math.min(startBlock + CHUNK_SIZE - 1, resolvedEndBlock);
    
    // Initialize counters
    let retryCount = 0;
    let totalEvents = 0;
    let allProcessedEvents: HypermapEvent[] = [];
    const eventTypes = ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'];
    const eventCounts: Record<string, number> = {};
    eventTypes.forEach(type => { eventCounts[type] = 0 });
    
    // Scan for events with retry logic
    let success = false;
    while (!success && retryCount <= MAX_RETRIES) {
      try {
        // Query with filter by contract address
        const allEventsFilter = { address: CONTRACT_ADDRESS };
        const events = await provider.getLogs({
          ...allEventsFilter,
          fromBlock: startBlock,
          toBlock: chunkEndBlock
        });
        
        // Parse logs to structured events
        const processedEvents = await parseLogsToEvents(events, contract, provider);
        allProcessedEvents = processedEvents;
        
        // Count events by type
        for (const event of allProcessedEvents) {
          totalEvents++;
          eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1;
        }
        
        success = true;
      } catch (error: any) {
        // Check if it's a rate limit error
        const errorMessage = error.toString();
        const isTooManyRequests = 
          errorMessage.includes("Too Many Requests") || 
          errorMessage.includes("rate limit") || 
          errorMessage.includes("429") ||
          errorMessage.includes("exceeded") ||
          (error.code === "SERVER_ERROR" && errorMessage.includes("limit"));
        
        if (isTooManyRequests && retryCount < MAX_RETRIES) {
          retryCount++;
          // Exponential backoff
          const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Fail after max retries or for non-rate-limit errors
          await client.close();
          return {
            status: 'error',
            message: `Error scanning blocks: ${errorMessage}`,
            progress: {
              fromBlock: startBlock,
              toBlock: resolvedEndBlock,
              currentBlock: startBlock,
              completion: 0
            },
            events: {
              total: 0,
              newInChunk: 0,
              byType: []
            },
            error: errorMessage
          };
        }
      }
    }
    
    // Store events in database
    let storeResult = { upsertedCount: 0, modifiedCount: 0 };
    if (allProcessedEvents.length > 0) {
      storeResult = await storeEvents(allProcessedEvents, collection);
    }
    
    // Calculate progress
    const totalBlockRange = resolvedEndBlock - startBlock + 1;
    const processedBlockRange = chunkEndBlock - startBlock + 1;
    const completion = Math.round((processedBlockRange / totalBlockRange) * 100);
    
    // Prepare event type data
    const byType: EventCount[] = Object.entries(eventCounts)
      .filter(([_, count]) => count > 0)
      .sort(([_, a], [__, b]) => b - a)
      .map(([type, count]) => ({
        type,
        count,
        percentage: totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0
      }));
    
    // Close MongoDB connection
    await client.close();
    
    // Determine next start block
    const nextStartBlock = chunkEndBlock < resolvedEndBlock 
      ? chunkEndBlock + 1 
      : undefined;
    
    // Determine status
    const status = nextStartBlock ? 'running' : 'completed';
    
    // Return response
    return {
      status,
      message: nextStartBlock
        ? `Processed blocks ${startBlock.toLocaleString()} to ${chunkEndBlock.toLocaleString()}`
        : `Completed processing blocks ${startBlock.toLocaleString()} to ${chunkEndBlock.toLocaleString()}`,
      progress: {
        fromBlock: startBlock,
        toBlock: resolvedEndBlock,
        currentBlock: chunkEndBlock,
        completion
      },
      events: {
        total: totalEvents,
        newInChunk: storeResult.upsertedCount,
        byType
      },
      nextStartBlock
    };
  } catch (error: any) {
    // Catch any unexpected errors
    return {
      status: 'error',
      message: `Unexpected error: ${error.message}`,
      progress: {
        fromBlock: startBlock,
        toBlock: endBlock === 'latest' ? 0 : endBlock,
        currentBlock: startBlock,
        completion: 0
      },
      events: {
        total: 0,
        newInChunk: 0,
        byType: []
      },
      error: error.stack || error.message
    };
  }
}