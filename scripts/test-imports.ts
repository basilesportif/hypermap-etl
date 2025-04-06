/**
 * Simple test script to verify the import structure
 */

// Import from services
import {
  createProvider,
  createContract,
  CONTRACT_ADDRESS
} from '../src/lib/services/events.js';

// Import types
import { HypermapEvent } from '../src/types/index.js';

console.log('Import test successful!');
console.log('Contract address:', CONTRACT_ADDRESS);

// Test creating a provider
if (process.env.BASE_RPC_URL) {
  const provider = createProvider(process.env.BASE_RPC_URL);
  console.log('Provider created successfully');
}