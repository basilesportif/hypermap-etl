/**
 * @file src/lib/services/rpc.ts
 * @description Provides functions for interacting with the Ethereum JSON-RPC provider.
 * Includes centralized exponential backoff retry logic for handling rate limits and transient network errors.
 *
 * Key features:
 * - Generic `callWithRetry` function to wrap any provider method.
 * - Specific helper functions (`getBlockNumberWithRetry`, `getBlockWithRetry`, `getLogsWithRetry`) for common calls.
 * - Robust error detection for rate limiting and recoverable network issues.
 * - Configurable retry limits and delays.
 *
 * @dependencies
 * - ethers: Blockchain interaction library.
 *
 * @notes
 * - This service centralizes RPC interactions to ensure consistent error handling and retry strategies.
 * - It's designed to be used by other services (like events.ts) and server actions.
 */

import { ethers, JsonRpcProvider, Log, Block } from 'ethers';

// Constants for retry logic
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000; // Base delay in milliseconds

/**
 * @interface RpcError
 * @description Extends the base Error interface to potentially include RPC-specific error codes.
 */
interface RpcError extends Error {
    code?: string | number; // JSON-RPC error code or HTTP status code
}

/**
 * @function isRateLimitOrRecoverableError
 * @description Checks if an error suggests a rate limit or a temporary network issue that might be resolved by retrying.
 * @param {any} error - The error object caught.
 * @returns {boolean} True if the error is likely recoverable, false otherwise.
 */
function isRateLimitOrRecoverableError(error: any): boolean {
    const rpcError = error as RpcError;
    const errorMessage = String(error?.message || error).toLowerCase(); // Case-insensitive matching

    // Check common rate limit indicators (HTTP 429, error messages)
    if (
        rpcError?.code === 429 ||
        errorMessage.includes("too many requests") ||
        errorMessage.includes("rate limit") ||
        errorMessage.includes("exceeded") ||
        errorMessage.includes("limit") // Broader check for limit messages
    ) {
        return true;
    }

    // Check for potentially transient network/server errors
    if (
        rpcError?.code === "NETWORK_ERROR" ||
        rpcError?.code === "TIMEOUT" ||
        rpcError?.code === "SERVER_ERROR" || // Sometimes used for overloaded nodes
        rpcError?.code === -32005 // EIP-1474 limit/offset error, sometimes indicates needing smaller range
    ) {
        return true;
    }

    // Specific provider messages (add more as encountered)
    if (errorMessage.includes("failed response") || errorMessage.includes("bad response")) {
        // Often indicates temporary server issues
        return true;
    }

    return false;
}


/**
 * @function callWithRetry
 * @description Wraps an ethers.js provider method call with exponential backoff retry logic.
 * @template T - The type of the provider method.
 * @param {string} methodName - The name of the method being called (for logging).
 * @param {T} providerMethod - The provider method to call (e.g., provider.getBlockNumber).
 * @param {Parameters<T>} args - The arguments to pass to the provider method.
 * @returns {Promise<ReturnType<T>>} A promise that resolves with the result of the provider method.
 * @throws {Error} Throws the last error if all retries fail, or an unexpected error occurs.
 */
async function callWithRetry<T extends (...args: any[]) => Promise<any>>(
    methodName: string,
    providerMethod: T,
    ...args: Parameters<T>
): Promise<ReturnType<T>> {
    let retryCount = 0;
    while (retryCount <= MAX_RETRIES) {
        try {
            // Attempt the actual provider call
            const result = await providerMethod(...args);
            // If successful, return the result
            return result;
        } catch (error: any) {
            retryCount++;
            console.warn(`RPC call '${methodName}' failed (Attempt ${retryCount}/${MAX_RETRIES}): ${error?.message || error}`);

            // Check if the error is recoverable and if we haven't exceeded max retries
            if (isRateLimitOrRecoverableError(error) && retryCount <= MAX_RETRIES) {
                // Calculate exponential backoff delay: 2^retry * BASE_DELAY + random jitter
                const delay = Math.pow(2, retryCount - 1) * BASE_RETRY_DELAY_MS + Math.random() * 1000;
                console.log(`Retrying '${methodName}' in ${Math.round(delay / 1000)}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                // Continue to the next iteration of the loop to retry
            } else {
                // If error is not recoverable or max retries exceeded, re-throw the error
                console.error(`RPC call '${methodName}' failed permanently after ${retryCount} attempts.`);
                throw error;
            }
        }
    }
    // This line should theoretically not be reached if MAX_RETRIES > 0,
    // but typescript needs a return path or explicit throw here.
    throw new Error(`RPC call '${methodName}' failed after exhausting all retries.`);
}

/**
 * @function getBlockNumberWithRetry
 * @description Fetches the latest block number from the provider with retry logic.
 * @param {JsonRpcProvider} provider - The ethers JSON-RPC provider instance.
 * @returns {Promise<number>} The latest block number.
 */
export async function getBlockNumberWithRetry(provider: JsonRpcProvider): Promise<number> {
    // Ensure the provider method is bound correctly to the provider instance
    const boundMethod = provider.getBlockNumber.bind(provider);
    return callWithRetry('getBlockNumber', boundMethod);
}

/**
 * @function getBlockWithRetry
 * @description Fetches a block by its number from the provider with retry logic.
 * @param {JsonRpcProvider} provider - The ethers JSON-RPC provider instance.
 * @param {number} blockNumber - The block number to fetch.
 * @returns {Promise<Block | null>} The block data or null if not found.
 */
export async function getBlockWithRetry(provider: JsonRpcProvider, blockNumber: number): Promise<Block | null> {
    const boundMethod = provider.getBlock.bind(provider);
    return callWithRetry('getBlock', boundMethod, blockNumber);
}

/**
 * @interface GetLogsFilter
 * @description Defines the filter criteria for fetching logs (subset of ethers.Filter).
 */
interface GetLogsFilter {
    address?: string;
    fromBlock?: number | string;
    toBlock?: number | string;
    topics?: Array<string | Array<string> | null>;
}

/**
 * @function getLogsWithRetry
 * @description Fetches logs based on filter criteria from the provider with retry logic.
 * @param {JsonRpcProvider} provider - The ethers JSON-RPC provider instance.
 * @param {GetLogsFilter} filter - The filter criteria for the logs.
 * @returns {Promise<Log[]>} An array of log objects.
 */
export async function getLogsWithRetry(provider: JsonRpcProvider, filter: GetLogsFilter): Promise<Log[]> {
    const boundMethod = provider.getLogs.bind(provider);
    return callWithRetry('getLogs', boundMethod, filter);
}