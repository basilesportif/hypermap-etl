/**
 * HyperMap ETL Constants
 */

// Contract Constants
export const CONTRACT_ADDRESS = '0x000000000044C6B8Cb4d8f0F889a3E47664EAeda';
export const ROOT_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Blockchain Constants
export const DEFAULT_CHAIN_ID = 8453; // Base Mainnet

// Indexing Constants
export const DEFAULT_START_BLOCK = 27270000; // First block of HyperMap deployment
export const DEFAULT_CHUNK_SIZE = 20000;      // Events fetched per batch
export const DEFAULT_BASE_DELAY_MS = 1000;    // Delay between chunks
export const MIN_CHUNK_SIZE = 1000;          // Minimum chunk size when auto-adjusting
export const MAX_RETRIES = 5;                // Maximum retries for rate limit errors