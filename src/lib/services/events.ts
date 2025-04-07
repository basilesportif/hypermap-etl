/**
 * @file src/lib/services/events.ts
 * @description Event Service
 * Provides functions for processing blockchain events from the HyperMap contract.
 * Handles event parsing, normalization, and utilizes the rpc.ts service for blockchain interactions.
 *
 * Key features:
 * - Parses raw logs into structured, typed HypermapEvent objects.
 * - Fetches block timestamps using retry logic via rpc.ts.
 * - Normalizes event data (e.g., decoding labels).
 * - Provides provider and contract creation helpers.
 *
 * @dependencies
 * - ethers: Blockchain interaction library.
 * - fs, path, url: Node.js modules for loading ABI file.
 * - ./rpc: Service for reliable RPC calls with retries.
 * - ../../types: TypeScript type definitions for events.
 * - ../../abi/hypermap.abi.json: Contract ABI definition.
 */

import { ethers, JsonRpcProvider, Log, Interface } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBlockWithRetry } from './rpc'; // Import the retry-enabled function
import {
    HypermapEvent, MintEvent, FactEvent, NoteEvent,
    GeneEvent, TransferEvent, ZeroEvent, UpgradedEvent,
    Bytes, Bytes32, Address
} from '../../types';

// Load ABI directly
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const abiPath = path.resolve(__dirname, '../../abi/hypermap.abi.json');
const HYPERMAP_ABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

// Contract address
export const CONTRACT_ADDRESS = '0x000000000044C6B8Cb4d8f0F889a3E47664EAeda';

/**
 * @function createProvider
 * @description Creates an ethers JSON-RPC provider instance.
 * @param {string} rpcUrl - The URL of the JSON-RPC endpoint.
 * @returns {ethers.JsonRpcProvider} The provider instance.
 */
export function createProvider(rpcUrl: string): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * @function createContract
 * @description Creates an ethers Contract instance for the HyperMap contract.
 * @param {ethers.JsonRpcProvider} provider - The provider instance.
 * @returns {ethers.Contract} The contract instance.
 */
export function createContract(provider: ethers.JsonRpcProvider): ethers.Contract {
    return new ethers.Contract(CONTRACT_ADDRESS, HYPERMAP_ABI, provider);
}

/**
 * @function getBlockTimestamp
 * @description Get the timestamp for a block using the retry-enabled RPC call.
 * @param {ethers.JsonRpcProvider} provider - The provider instance.
 * @param {number} blockNumber - The block number to get the timestamp for.
 * @returns {Promise<number | null>} The block timestamp (Unix epoch seconds) or null if the block doesn't exist or an error occurs after retries.
 */
export async function getBlockTimestamp(
    provider: ethers.JsonRpcProvider,
    blockNumber: number
): Promise<number | null> {
    try {
        // Use the centralized retry logic from rpc.ts
        const block = await getBlockWithRetry(provider, blockNumber);
        return block ? Number(block.timestamp) : null;
    } catch (err) {
        // Log the error if getBlockWithRetry fails after all attempts
        console.error(`Failed to get timestamp for block ${blockNumber} after retries:`, err);
        return null;
    }
}

/**
 * @interface ProcessedLogData
 * @description Represents the combined data from a raw log and its parsed version.
 */
interface ProcessedLogData extends Log {
    fragment: ethers.LogDescription['fragment'];
    name: ethers.LogDescription['name'];
    args: ethers.LogDescription['args'];
}

/**
 * @function processLog
 * @description Processes a single parsed log into a structured HypermapEvent.
 * Fetches the block timestamp asynchronously.
 * @param {ProcessedLogData} log - The raw log combined with parsed data (fragment, name, args).
 * @param {ethers.JsonRpcProvider} provider - The provider instance.
 * @returns {Promise<HypermapEvent | null>} The processed HypermapEvent or null if processing fails or event type is unknown.
 */
export async function processLog(
    log: ProcessedLogData,
    provider: ethers.JsonRpcProvider
): Promise<HypermapEvent | null> {
    // Validate we have a fragment and name
    if (!log.fragment || !log.name) {
        console.warn(`Skipping log without fragment or name: block=${log.blockNumber}, tx=${log.transactionHash}, index=${log.logIndex}`);
        return null;
    }

    // Get event name
    const eventName = log.name;

    // Get timestamp asynchronously
    // We fetch the timestamp here to include it in the event object.
    // Potential optimization: Fetch timestamps in batch if performance becomes an issue.
    let timestamp: number | null = null;
    try {
        timestamp = await getBlockTimestamp(provider, log.blockNumber);
    } catch (err) {
        // Error is already logged by getBlockTimestamp/getBlockWithRetry
        console.warn(`Could not retrieve timestamp for block ${log.blockNumber}, continuing without it.`);
    }

    // Create base event data
    const baseEvent: BaseHypermapEvent = {
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex,
        logIndex: log.logIndex, // Use logIndex (standard)
        // Include timestamp only if successfully fetched
        ...(timestamp !== null && { timestamp }),
    };

    // Safely get arguments with fallbacks
    const args = log.args || [];

    let eventData: HypermapEvent | null = null;

    try {
        switch (eventName) {
            case 'Mint': {
                eventData = {
                    ...baseEvent,
                    eventType: 'Mint',
                    parenthash: args[0],
                    childhash: args[1],
                    labelhash: args[2], // bytes (indexed) - keep as hex string
                    label: ethers.toUtf8String(args[3]) // bytes - decode UTF8
                } as MintEvent;
                break;
            }

            case 'Fact': {
                eventData = {
                    ...baseEvent,
                    eventType: 'Fact',
                    parenthash: args[0],
                    facthash: args[1],
                    labelhash: args[2], // bytes (indexed) - keep as hex string
                    label: ethers.toUtf8String(args[3]), // bytes - decode UTF8
                    data: args[4] // bytes - keep as hex string
                } as FactEvent;
                break;
            }

            case 'Note': {
                eventData = {
                    ...baseEvent,
                    eventType: 'Note',
                    parenthash: args[0],
                    notehash: args[1],
                    labelhash: args[2], // bytes (indexed) - keep as hex string
                    label: ethers.toUtf8String(args[3]), // bytes - decode UTF8
                    data: args[4] // bytes - keep as hex string
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
                // Ensure ID is converted to string for consistency (MongoDB might handle BigInt poorly)
                const idArg = args[2];
                const idString = typeof idArg === 'bigint' ? idArg.toString() : String(idArg);
                eventData = {
                    ...baseEvent,
                    eventType: 'Transfer',
                    from: args[0],
                    to: args[1],
                    id: idString // uint256 (indexed) as string
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
                console.warn(`Unknown event type encountered: ${eventName} in tx ${log.transactionHash}`);
                return null; // Explicitly return null for unknown types
        }
    } catch (parseError) {
        console.error(`Error parsing arguments for event ${eventName} in tx ${log.transactionHash}:`, parseError);
        console.error(`Arguments received:`, args);
        return null; // Return null if argument parsing fails
    }

    return eventData;
}


/**
 * @function parseLogsToEvents
 * @description Parses an array of raw logs into structured HypermapEvents using the contract ABI.
 * Handles potential parsing errors for individual logs. Fetches timestamps concurrently.
 * @param {Log[]} logs - An array of raw log objects fetched from the provider.
 * @param {ethers.Contract} contract - The ethers Contract instance with the ABI.
 * @param {ethers.JsonRpcProvider} provider - The provider instance.
 * @returns {Promise<HypermapEvent[]>} A promise resolving to an array of successfully processed HypermapEvents.
 */
export async function parseLogsToEvents(
    logs: Log[],
    contract: ethers.Contract,
    provider: ethers.JsonRpcProvider
): Promise<HypermapEvent[]> {

    const processingPromises: Promise<HypermapEvent | null>[] = [];

    for (const log of logs) {
        try {
            // Attempt to parse the log using the contract's interface
            const parsedLogDescription = contract.interface.parseLog(log as ethers.TopicFilter); // Cast needed for ethers v6 type

            if (parsedLogDescription) {
                // Combine raw log data with parsed data
                 const processedLogData: ProcessedLogData = {
                    ...log, // Spread raw log properties (blockNumber, blockHash, etc.)
                    fragment: parsedLogDescription.fragment,
                    name: parsedLogDescription.name,
                    args: parsedLogDescription.args
                };
                // Start processing (including async timestamp fetch) and add the promise
                processingPromises.push(processLog(processedLogData, provider));
            } else {
                 console.warn(`Log could not be parsed by interface: tx=${log.transactionHash}, index=${log.logIndex}`);
            }
        } catch (error) {
            // Log parsing errors (e.g., if log topic doesn't match ABI)
            // console.warn(`Error parsing log: tx=${log.transactionHash}, index=${log.logIndex}`, error);
             // Usually indicates a log not matching the ABI, which is expected if filtering only by address. Can be ignored.
        }
    }

    // Wait for all processing promises to settle
    const processedResults = await Promise.allSettled(processingPromises);

    // Filter out nulls (failed processing) and extract successful results
    const events: HypermapEvent[] = processedResults
        .filter(result => result.status === 'fulfilled' && result.value !== null)
        .map(result => (result as PromiseFulfilledResult<HypermapEvent>).value);

    return events;
}


/**
 * @function formatTimestamp
 * @description Formats a Unix timestamp (seconds) into an ISO string.
 * @param {number | undefined | null} timestamp - The timestamp in seconds.
 * @returns {string} ISO formatted date string or 'Unknown'.
 */
export function formatTimestamp(timestamp: number | undefined | null): string {
    return timestamp ? new Date(timestamp * 1000).toISOString() : 'Unknown';
}

/**
 * @function formatHex
 * @description Formats a hex string for display (shortened).
 * @param {string | null | undefined} hex - The hex string.
 * @param {number} [length=10] - The desired length of the prefix before ellipsis.
 * @returns {string} Formatted hex string or 'null'.
 */
export function formatHex(hex: string | null | undefined, length = 10): string {
    if (!hex) return 'null';
    if (hex.length <= length + 4 + 2) return hex; // Don't shorten if already short (incl. 0x prefix)
    return hex.substring(0, length) + '...' + hex.substring(hex.length - 4);
}