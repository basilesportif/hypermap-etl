/**
 * @file src/app/actions.ts
 * @description Server actions for the HyperMap ETL application.
 * This file contains functions that execute on the server, primarily for interacting
 * with the blockchain and the database to fetch status information and extract events.
 *
 * Key features:
 * - getStatus: Fetches the current status of the ETL process, including event counts and the last processed block.
 * - extractEvents: Extracts events from the blockchain within a specified block range and stores them in the database.
 *
 * @dependencies
 * - ethers: Blockchain interaction library.
 * - mongodb: Native MongoDB driver for database operations.
 * - mongoose: ODM for MongoDB, used for models and schema validation.
 * - ../lib/services/events: Provides blockchain interaction utilities (provider, contract, parsing).
 * - ../types: Defines TypeScript interfaces for events and other data structures.
 * - ../models: Mongoose models for database collections.
 * - ../lib/services/mongodb: Provides database connection utilities.
 */

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

/**
 * @interface StatusResponse
 * @description Defines the structure of the response from the extractEvents action.
 */
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

/**
 * @interface EventCount
 * @description Represents the count and percentage of a specific event type.
 */
interface EventCount {
  type: string;
  count: number;
  percentage: number;
}

/**
 * @function getStatus
 * @description Fetches the current status of the ETL process from the database and the blockchain.
 * It retrieves event counts by type, the last block processed in the database, and the latest block number on the blockchain.
 * @returns {Promise<object>} An object containing event statistics, processing status, and the latest blockchain block number.
 * @throws {Error} If fetching status data or connecting to the database fails.
 */
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

    // 2. Get last block processed from the database
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

    // 3. Get latest block number from the blockchain provider
    let latestBlockNumber = 0;
    try {
        const provider = createProvider(process.env.BASE_RPC_URL as string);
        latestBlockNumber = await provider.getBlockNumber();
    } catch (providerError) {
        console.error('Error getting latest block number from provider:', providerError);
        // Keep latestBlockNumber as 0 or handle appropriately
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
        hoursAgo,
        latestBlockNumber // Added latest block number
      }
    };
  } catch (error) {
    console.error('Error getting status:', error);
    throw new Error('Failed to get status data');
  }
}

/**
 * @function generateEventId
 * @description Generates a unique ID for a blockchain event based on its transaction hash and log index.
 * This ID is used as the `_id` field in the MongoDB document.
 * @param {HypermapEvent} event - The event object.
 * @returns {string} A unique identifier string.
 */
function generateEventId(event: HypermapEvent): string {
  return `${event.transactionHash}_${event.logIndex}`;
}

/**
 * @function storeEvents
 * @description Stores a list of Hypermap events in the MongoDB collection using bulk write operations.
 * It uses upsert to avoid duplicates based on the generated event ID.
 * @param {HypermapEvent[]} events - An array of event objects to store.
 * @param {any} collection - The MongoDB collection instance.
 * @returns {Promise<{ upsertedCount: number; modifiedCount: number; }>} The result of the bulk write operation.
 * @throws {Error} If a non-duplicate key error occurs during the database operation.
 */
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
    // Handle duplicate key errors gracefully
    if (error.code === 11000) {
      console.log(`Some events already exist in database, skipped duplicates`);
      // Return zero counts as no new events were truly upserted from this batch
      // due to duplicates, though bulkWrite might report upsertedCount differently
      // depending on exact race conditions. This provides clearer feedback.
      return { upsertedCount: 0, modifiedCount: 0 };
    } else {
        console.error('Error storing events during bulkWrite:', error);
      throw error; // Rethrow other errors
    }
  }
}

/**
 * @function extractEvents
 * @description Extracts Hypermap events from the blockchain for a specific range of blocks.
 * It handles fetching logs, parsing them, storing them in the database, and includes retry logic for rate limits.
 * @param {number} startBlock - The starting block number for extraction.
 * @param {number | 'latest'} endBlock - The ending block number or 'latest' to process up to the current block.
 * @returns {Promise<StatusResponse>} An object detailing the status, progress, and results of the extraction chunk.
 */
export async function extractEvents(
  startBlock: number,
  endBlock: number | 'latest'
): Promise<StatusResponse> {
  let client: MongoClient | null = null; // Declare client outside try block

  try {
    // Initialize MongoDB connection
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
        if (client) await client.close(); // Ensure client is closed on early return
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
    let totalEventsInChunk = 0; // Renamed for clarity
    let allProcessedEvents: HypermapEvent[] = [];
    const eventTypes = ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'];
    const eventCountsInChunk: Record<string, number> = {}; // Renamed for clarity
    eventTypes.forEach(type => { eventCountsInChunk[type] = 0 });

    // Scan for events with retry logic
    let success = false;
    while (!success && retryCount <= MAX_RETRIES) {
      try {
        // Query with filter by contract address
        const allEventsFilter = { address: CONTRACT_ADDRESS };
        const logs = await provider.getLogs({ // Changed variable name from 'events' to 'logs'
          ...allEventsFilter,
          fromBlock: startBlock,
          toBlock: chunkEndBlock
        });

        // Parse logs to structured events
        const processedEvents = await parseLogsToEvents(logs, contract, provider);
        allProcessedEvents = processedEvents;

        // Count events by type for this chunk
        totalEventsInChunk = 0; // Reset count for this attempt
        eventTypes.forEach(type => { eventCountsInChunk[type] = 0 }); // Reset counts for this attempt
        for (const event of allProcessedEvents) {
          totalEventsInChunk++;
          eventCountsInChunk[event.eventType] = (eventCountsInChunk[event.eventType] || 0) + 1;
        }

        success = true; // Mark as successful if getLogs and parsing complete
      } catch (error: any) {
        retryCount++;
        const errorMessage = error.toString();
        console.warn(`Attempt ${retryCount}/${MAX_RETRIES} failed: ${errorMessage}`);

        // Check if it's a rate limit error or potentially recoverable error
        const isRateLimitOrRecoverable =
            errorMessage.includes("Too Many Requests") ||
            errorMessage.includes("rate limit") ||
            errorMessage.includes("429") ||
            errorMessage.includes("exceeded") ||
            (error.code === "SERVER_ERROR" && errorMessage.includes("limit")) ||
            error.code === "NETWORK_ERROR" || // Added network error
            error.code === "TIMEOUT"; // Added timeout error

        if (isRateLimitOrRecoverable && retryCount <= MAX_RETRIES) {
          // Exponential backoff
          const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount - 1) + Math.random() * 1000; // Adjusted delay calculation
          console.log(`Retrying in ${Math.round(delay / 1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
            if (client) await client.close(); // Ensure client is closed on failure
          // Fail after max retries or for non-recoverable errors
          return {
            status: 'error',
            message: `Error scanning blocks after ${retryCount} attempts: ${errorMessage}`,
            progress: {
              fromBlock: startBlock,
              toBlock: resolvedEndBlock, // Use resolvedEndBlock
              currentBlock: startBlock, // Indicates failure at the start of the chunk attempt
              completion: 0 // Or calculate based on last successful chunk if applicable
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

    // Close MongoDB connection
    if (client) await client.close();

    // Calculate progress based on the whole requested range
    // Note: This progress calculation assumes a linear progression through the total requested range.
    // If 'latest' was used, resolvedEndBlock reflects the latest block *at the time of the request*.
    // The actual latest block might have changed during processing.
    const totalRequestedBlockRange = resolvedEndBlock - (startBlock) + 1; // Initial startBlock from request
    const processedBlocksInThisChunk = chunkEndBlock - startBlock + 1;
    // We need a way to track total progress across multiple calls if extractEvents is called sequentially.
    // For a single call, this calculation is fine, but for the UI, we need the overall progress.
    // The current structure calculates progress *for the requested range*, which might span multiple chunks.
    // Let's refine progress calculation based on the overall goal later if needed.
    // For now, progress reflects the completion *within the current extractEvents call's target range*.
    // Let's adjust calculation for the overall progress, assuming `fromBlock` in the return refers to the original start.
    const overallStartBlock = startBlock; // Assuming this function is called iteratively
    const overallCurrentBlock = chunkEndBlock;
    const overallTargetBlock = resolvedEndBlock;
    const overallCompletion = overallTargetBlock > overallStartBlock
     ? Math.round(((overallCurrentBlock - overallStartBlock + 1) / (overallTargetBlock - overallStartBlock + 1)) * 100)
     : 100; // Handle case where start and end are the same


    // Prepare event type data for this chunk
    const byType: EventCount[] = Object.entries(eventCountsInChunk) // Use chunk-specific counts
      .filter(([_, count]) => count > 0)
      .sort(([_, a], [__, b]) => b - a)
      .map(([type, count]) => ({
        type,
        count,
        percentage: totalEventsInChunk > 0 ? Math.round((count / totalEventsInChunk) * 100) : 0
      }));

    // Determine next start block
    const nextStartBlock = chunkEndBlock < resolvedEndBlock
      ? chunkEndBlock + 1
      : undefined; // Undefined if this chunk reached the end

    // Determine status
    const status = nextStartBlock ? 'running' : 'completed';

    // Return response
    return {
      status,
      message: nextStartBlock
        ? `Processed blocks ${startBlock.toLocaleString()} to ${chunkEndBlock.toLocaleString()}. Found ${storeResult.upsertedCount} new events.` // Updated message
        : `Completed processing blocks ${startBlock.toLocaleString()} to ${chunkEndBlock.toLocaleString()}. Found ${storeResult.upsertedCount} new events.`, // Updated message
      progress: {
        fromBlock: startBlock, // The start block for *this specific invocation*
        toBlock: resolvedEndBlock, // The target end block for *this specific invocation*
        currentBlock: chunkEndBlock, // The last block processed in *this chunk*
        completion: overallCompletion // Overall progress for the requested range
      },
      events: {
        total: totalEventsInChunk, // Total events found in *this chunk*
        newInChunk: storeResult.upsertedCount, // New events added *in this chunk*
        byType // Event breakdown *for this chunk*
      },
      nextStartBlock // Suggests the start for the next chunk if needed
    };
  } catch (error: any) {
    console.error(`Unexpected error in extractEvents from block ${startBlock}:`, error);
    if (client) await client.close(); // Ensure client is closed on unexpected error
    // Catch any unexpected errors during setup or teardown
    return {
      status: 'error',
      message: `Unexpected error: ${error.message}`,
      progress: {
        fromBlock: startBlock,
        toBlock: typeof endBlock === 'number' ? endBlock : 0, // Use original endBlock goal if possible
        currentBlock: startBlock, // Failed before or during the first chunk
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