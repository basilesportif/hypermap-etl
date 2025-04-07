/**
 * @file src/app/actions.ts
 * @description Server actions for the HyperMap ETL application.
 * This file contains functions that execute on the server, primarily for interacting
 * with the blockchain and the database to fetch status information and extract events.
 * Uses the centralized RPC service for reliable blockchain communication.
 *
 * Key features:
 * - getStatus: Fetches the current status of the ETL process, including event counts and the last processed block.
 * - extractEvents: Extracts events from the blockchain within a specified block range and stores them in the database.
 *
 * @dependencies
 * - ethers: Blockchain interaction library (used indirectly via services).
 * - mongodb: Native MongoDB driver for database operations.
 * - mongoose: ODM for MongoDB, used for models and schema validation.
 * - ../lib/services/events: Provides blockchain interaction utilities (provider, contract, parsing).
 * - ../lib/services/rpc: Provides reliable RPC calls with retry logic.
 * - ../types: Defines TypeScript interfaces for events and other data structures.
 * - ../models: Mongoose models for database collections.
 * - ../lib/services/mongodb: Provides database connection utilities.
 */

'use server';

import { ethers } from 'ethers'; // Still needed for types/constants if used
import { MongoClient, Collection } from 'mongodb'; // Using native driver for bulk writes
import mongoose from 'mongoose';
import {
    createProvider,
    createContract,
    parseLogsToEvents,
    CONTRACT_ADDRESS
} from '../lib/services/events';
import { // Import retry-enabled RPC functions
    getBlockNumberWithRetry,
    getLogsWithRetry
} from '../lib/services/rpc';
import { HypermapEvent } from '../types';
import { HypermapEventModel } from '../models';
import { initMongoConnection } from '../lib/services/mongodb';

// Constants
const CHUNK_SIZE = 20000; // Process 20k blocks at a time (Consider making this configurable via env)

/**
 * @interface StatusResponse
 * @description Defines the structure of the response from the extractEvents action.
 */
interface StatusResponse {
    status: 'running' | 'completed' | 'error';
    message: string;
    progress: {
        fromBlock: number;
        toBlock: number; // The *resolved* target end block for the request
        currentBlock: number; // Last block processed in the *latest* chunk
        completion: number; // Overall completion percentage for the request
    };
    events: {
        total: number; // Total events found in the *latest* chunk
        newInChunk: number; // New events stored from the *latest* chunk
        byType: {
            type: string;
            count: number;
            percentage: number;
        }[]; // Breakdown *for the latest* chunk
    };
    nextStartBlock?: number; // The start block for the next chunk, if applicable
    error?: string; // Error message if status is 'error'
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
 * It retrieves event counts by type, the last block processed in the database, and the latest block number on the blockchain (using retry logic).
 * @returns {Promise<object>} An object containing event statistics, processing status, and the latest blockchain block number.
 * @throws {Error} If fetching status data or connecting to the database fails, or if fetching the latest block fails after retries.
 */
export async function getStatus() {
    // Initialize MongoDB connection if not already connected
    // Note: initMongoConnection uses mongoose.connect internally
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
            .lean(); // Use lean for performance if full mongoose doc isn't needed

        let lastBlock = 0;
        let lastBlockTime = new Date(0).toISOString(); // Default to epoch if no events
        let hoursAgo = -1; // Indicate unknown if no events

        if (lastEvent) {
            lastBlock = lastEvent.blockNumber;

            if (lastEvent.timestamp) {
                const lastBlockDate = new Date(lastEvent.timestamp * 1000);
                lastBlockTime = lastBlockDate.toISOString();

                const now = new Date();
                const diffMs = now.getTime() - lastBlockDate.getTime();
                hoursAgo = Math.round(diffMs / (1000 * 60 * 60));
            } else {
                 // Handle case where timestamp might be missing on older records
                 lastBlockTime = 'Timestamp unavailable';
                 hoursAgo = -1; // Indicate unknown
            }
        }

        // 3. Get latest block number from the blockchain provider using retry logic
        let latestBlockNumber = 0;
        try {
            const provider = createProvider(process.env.BASE_RPC_URL as string);
            // Use the retry-enabled function from rpc.ts
            latestBlockNumber = await getBlockNumberWithRetry(provider);
        } catch (providerError: any) {
            console.error('Error getting latest block number from provider (after retries):', providerError);
            // Keep latestBlockNumber as 0 to indicate failure, or throw?
            // Let's return 0 for now, UI can indicate unavailability.
            // Alternatively, could re-throw here to indicate a critical failure.
            // throw new Error(`Failed to get latest block number after retries: ${providerError.message}`);
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
                latestBlockNumber // Includes latest block number (or 0 if failed)
            }
        };
    } catch (error) {
        console.error('Error in getStatus:', error);
        // Throw a more specific error to be caught by the calling component
        throw new Error(`Failed to get status data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * @function generateEventId
 * @description Generates a unique ID for a blockchain event based on its transaction hash and log index.
 * This ID is used as the `_id` field in the MongoDB document to ensure idempotency.
 * @param {HypermapEvent} event - The event object.
 * @returns {string} A unique identifier string (txHash_logIndex).
 */
function generateEventId(event: HypermapEvent): string {
    return `${event.transactionHash}_${event.logIndex}`;
}

/**
 * @function storeEvents
 * @description Stores a list of Hypermap events in the MongoDB collection using bulk write operations.
 * It uses upsert with a custom `_id` (txHash_logIndex) to avoid duplicates and handle re-processing gracefully.
 * @param {HypermapEvent[]} events - An array of event objects to store.
 * @param {Collection} collection - The MongoDB native driver collection instance.
 * @returns {Promise<{ upsertedCount: number; modifiedCount: number; }>} The result of the bulk write operation (number of new/modified docs).
 * @throws {Error} If a non-duplicate key error occurs during the database operation.
 */
async function storeEvents(events: HypermapEvent[], collection: Collection): Promise<{
    upsertedCount: number;
    modifiedCount: number;
}> {
    if (!events.length) {
        return { upsertedCount: 0, modifiedCount: 0 };
    }

    try {
        // Prepare events with unique _id field
        const eventsWithId = events.map(event => ({
            ...event,
            _id: generateEventId(event) // Use txHash_logIndex as the document ID
        }));

        // Use bulkWrite with updateOne operations and upsert:true
        // This will insert if the _id doesn't exist, or update if it does.
        // Using $set ensures the entire document is overwritten if it exists,
        // which is useful if event parsing logic changes.
        const operations = eventsWithId.map(event => ({
            updateOne: {
                filter: { _id: event._id },
                update: { $set: event }, // Use $set to replace the document content
                upsert: true // Insert if document does not exist
            }
        }));

        // Execute the bulk write operation. ordered:false allows processing to continue if one operation fails.
        const result = await collection.bulkWrite(operations, { ordered: false });

        // Return the counts of upserted (newly inserted) and modified (updated existing) documents.
        return {
            upsertedCount: result.upsertedCount,
            modifiedCount: result.modifiedCount
        };
    } catch (error: any) {
        // Specifically handle duplicate key errors (code 11000) which might still occur
        // in rare race conditions if not using upsert correctly, though upsert should prevent them.
        // Log them but don't treat as critical failure.
        if (error.code === 11000) {
            console.warn(`Bulk write encountered duplicate key errors despite upsert. This might indicate a race condition or configuration issue. Error: ${error.message}`);
            // Even if duplicates are encountered, result might partially report success.
            // It's safer to return 0 here to avoid misinterpretation downstream.
             return { upsertedCount: 0, modifiedCount: 0 };
        } else {
            // Log and re-throw other types of database errors.
            console.error('Error storing events during bulkWrite:', error);
            throw new Error(`Failed to store events in database: ${error.message}`);
        }
    }
}

/**
 * @function extractEvents
 * @description Extracts Hypermap events from the blockchain for a specific range of blocks.
 * It handles fetching logs (with retry via rpc.ts), parsing them, storing them in the database,
 * and returns the status of the operation for the processed chunk.
 * @param {number} startBlock - The starting block number for extraction (inclusive).
 * @param {number | 'latest'} endBlockInput - The desired ending block number or 'latest' to process up to the current block.
 * @returns {Promise<StatusResponse>} An object detailing the status, progress, and results of the extraction chunk.
 */
export async function extractEvents(
    startBlock: number,
    endBlockInput: number | 'latest'
): Promise<StatusResponse> {
    let client: MongoClient | null = null; // Declare client outside try block for finally clause

    try {
        // 1. Setup: Connect to DB, create provider/contract
        let db: any;
        let collection: Collection;

        // Connect to MongoDB using native driver for bulkWrite
        client = new MongoClient(process.env.MONGODB_URI as string);
        await client.connect();
        db = client.db(); // Use default DB from connection string
        collection = db.collection('hypermapevents'); // Use your collection name

        const provider = createProvider(process.env.BASE_RPC_URL as string);
        const contract = createContract(provider);

        // 2. Determine Block Range for this operation
        let resolvedTargetEndBlock: number;
        if (endBlockInput === 'latest') {
            // Fetch latest block using retry logic
             try {
                 resolvedTargetEndBlock = await getBlockNumberWithRetry(provider);
             } catch (rpcError: any) {
                 console.error('Failed to resolve latest block number after retries:', rpcError);
                 if (client) await client.close();
                 return {
                     status: 'error',
                     message: `Failed to get latest block number: ${rpcError.message}`,
                     progress: { fromBlock: startBlock, toBlock: 0, currentBlock: startBlock, completion: 0 },
                     events: { total: 0, newInChunk: 0, byType: [] },
                     error: `Failed to resolve 'latest' block: ${rpcError.message}`
                 };
             }
        } else {
            resolvedTargetEndBlock = endBlockInput;
        }

        // Validate block range sanity
        if (resolvedTargetEndBlock < startBlock) {
             if (client) await client.close();
            return {
                status: 'error',
                message: 'End block cannot be before start block',
                progress: { fromBlock: startBlock, toBlock: resolvedTargetEndBlock, currentBlock: startBlock, completion: 0 },
                events: { total: 0, newInChunk: 0, byType: [] },
                error: `Invalid block range: ${startBlock} > ${resolvedTargetEndBlock}`
            };
        }

        // Calculate the actual end block for *this specific chunk*
        const chunkEndBlock = Math.min(startBlock + CHUNK_SIZE - 1, resolvedTargetEndBlock);

        // 3. Fetch Logs using retry logic
        let logs: ethers.Log[] = [];
        try {
            const allEventsFilter = {
                 address: CONTRACT_ADDRESS,
                 fromBlock: startBlock,
                 toBlock: chunkEndBlock
             };
            // Use the retry-enabled function from rpc.ts
            logs = await getLogsWithRetry(provider, allEventsFilter);
             console.log(`Workspaceed ${logs.length} raw logs for blocks ${startBlock.toLocaleString()} - ${chunkEndBlock.toLocaleString()}`);
        } catch (error: any) {
             // Error occurred even after retries in getLogsWithRetry
             console.error(`Error fetching logs for blocks ${startBlock}-${chunkEndBlock} after retries:`, error);
             if (client) await client.close();
             return {
                 status: 'error',
                 message: `Failed to fetch logs after retries: ${error.message}`,
                 progress: { fromBlock: startBlock, toBlock: resolvedTargetEndBlock, currentBlock: startBlock, completion: 0 },
                 events: { total: 0, newInChunk: 0, byType: [] },
                 error: `Failed getLogs: ${error.message}`
             };
        }

        // 4. Parse Logs
        // This step includes fetching timestamps internally via getBlockTimestamp -> getBlockWithRetry
        let processedEvents: HypermapEvent[] = [];
         try {
             processedEvents = await parseLogsToEvents(logs, contract, provider);
             console.log(`Parsed ${processedEvents.length} events from ${logs.length} logs.`);
         } catch (parseError: any) {
              // Catch potential errors during the parsing phase itself (though parseLogsToEvents tries to handle internal errors)
              console.error(`Error parsing logs for blocks ${startBlock}-${chunkEndBlock}:`, parseError);
              if (client) await client.close();
              return {
                  status: 'error',
                  message: `Failed to parse logs: ${parseError.message}`,
                  progress: { fromBlock: startBlock, toBlock: resolvedTargetEndBlock, currentBlock: startBlock, completion: 0 },
                  events: { total: 0, newInChunk: 0, byType: [] },
                  error: `Failed parseLogsToEvents: ${parseError.message}`
              };
         }


        // 5. Store Events
        let storeResult = { upsertedCount: 0, modifiedCount: 0 };
        if (processedEvents.length > 0) {
            try {
                 storeResult = await storeEvents(processedEvents, collection);
                 console.log(`Stored events: ${storeResult.upsertedCount} new, ${storeResult.modifiedCount} updated.`);
            } catch (dbError: any) {
                 // Catch errors from storeEvents (which already logs details)
                 if (client) await client.close();
                 return {
                     status: 'error',
                     message: `Failed to store events in database: ${dbError.message}`,
                     progress: { fromBlock: startBlock, toBlock: resolvedTargetEndBlock, currentBlock: chunkEndBlock, completion: 0 }, // Progress stopped here
                     events: { total: processedEvents.length, newInChunk: 0, byType: [] },
                     error: `Failed storeEvents: ${dbError.message}`
                 };
            }
        }

        // 6. Calculate Progress and Prepare Response

        // Calculate overall progress based on the original request's target
        const overallCompletion = resolvedTargetEndBlock > startBlock
            ? Math.round(((chunkEndBlock - startBlock + 1) / (resolvedTargetEndBlock - startBlock + 1)) * 100)
            : (startBlock === resolvedTargetEndBlock ? 100 : 0); // Handle single block or initial state

        // Calculate event breakdown *for this chunk*
        const eventCountsInChunk: Record<string, number> = {};
        processedEvents.forEach(event => {
            eventCountsInChunk[event.eventType] = (eventCountsInChunk[event.eventType] || 0) + 1;
        });

        const byType: EventCount[] = Object.entries(eventCountsInChunk)
            .sort(([_, a], [__, b]) => b - a) // Sort by count desc
            .map(([type, count]) => ({
                type,
                count,
                percentage: processedEvents.length > 0 ? Math.round((count / processedEvents.length) * 100) : 0
            }));

        // Determine next start block for recursive calls or completion
        const nextStartBlock = chunkEndBlock < resolvedTargetEndBlock
            ? chunkEndBlock + 1
            : undefined; // Undefined signifies completion

        const status = nextStartBlock ? 'running' : 'completed';
        const message = `${status === 'completed' ? 'Completed processing' : 'Processed'} blocks ${startBlock.toLocaleString()} to ${chunkEndBlock.toLocaleString()}. Found ${storeResult.upsertedCount} new events.`;

        // Close DB connection
        if (client) await client.close();

        // Return structured response
        return {
            status,
            message,
            progress: {
                fromBlock: startBlock,          // Start block of the initial request might be needed upstream
                toBlock: resolvedTargetEndBlock,// The overall target end block
                currentBlock: chunkEndBlock,    // Last block processed in *this* chunk
                completion: overallCompletion   // Overall progress % towards toBlock
            },
            events: {
                total: processedEvents.length,  // Total *valid* events found in this chunk
                newInChunk: storeResult.upsertedCount, // Newly stored events in this chunk
                byType                         // Breakdown for this chunk
            },
            nextStartBlock // Signal for the next iteration
        };

    } catch (error: any) {
        // Catch any unexpected errors during setup, teardown, or logic flow
        console.error(`Unexpected error in extractEvents from block ${startBlock}:`, error);
        if (client) {
            try { await client.close(); } catch (closeErr) { console.error("Failed to close MongoDB client during error handling:", closeErr); }
        }
        return {
            status: 'error',
            message: `Unexpected error processing block range starting at ${startBlock}: ${error.message}`,
            progress: {
                fromBlock: startBlock,
                toBlock: typeof endBlockInput === 'number' ? endBlockInput : 0, // Best guess at target
                currentBlock: startBlock, // Failed somewhere within the first chunk attempt
                completion: 0
            },
            events: { total: 0, newInChunk: 0, byType: [] },
            error: error.stack || error.message
        };
    }
}