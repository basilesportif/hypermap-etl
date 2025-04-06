import { ethers } from 'ethers';

// Helper types for handling blockchain data formats
export type Bytes = string;            // Hex string representing bytes
export type Bytes32 = string;          // Hex string representing bytes32
export type Address = string;          // Ethereum address as hex string

// Base event interface
export interface BaseHypermapEvent {
  blockNumber: number;
  blockHash: Bytes32;
  transactionHash: Bytes32;
  transactionIndex: number;
  logIndex: number;
  timestamp?: number;
}

// Event types based on the plan
export interface MintEvent extends BaseHypermapEvent {
  eventType: 'Mint';
  parenthash: Bytes32;         // bytes32 (indexed)
  childhash: Bytes32;          // bytes32 (indexed)
  labelhash: Bytes;            // bytes (indexed) - raw bytes converted to hex string 
  label: string;               // bytes - decoded from UTF8
}

export interface FactEvent extends BaseHypermapEvent {
  eventType: 'Fact';
  parenthash: Bytes32;         // bytes32 (indexed)
  facthash: Bytes32;           // bytes32 (indexed)
  labelhash: Bytes;            // bytes (indexed) - raw bytes converted to hex string
  label: string;               // bytes - decoded from UTF8
  data: Bytes;                 // bytes
}

export interface NoteEvent extends BaseHypermapEvent {
  eventType: 'Note';
  parenthash: Bytes32;         // bytes32 (indexed)
  notehash: Bytes32;           // bytes32 (indexed)
  labelhash: Bytes;            // bytes (indexed) - raw bytes converted to hex string
  label: string;               // bytes - decoded from UTF8
  data: Bytes;                 // bytes
}

export interface GeneEvent extends BaseHypermapEvent {
  eventType: 'Gene';
  entry: Bytes32;             // bytes32 (indexed)
  gene: Address;              // address (indexed)
}

export interface TransferEvent extends BaseHypermapEvent {
  eventType: 'Transfer';
  from: Address;              // address (indexed)
  to: Address;                // address (indexed)
  id: string;                 // uint256 (indexed)
}

export interface ZeroEvent extends BaseHypermapEvent {
  eventType: 'Zero';
  zeroTba: Address;           // address (indexed)
}

export interface UpgradedEvent extends BaseHypermapEvent {
  eventType: 'Upgraded';
  implementation: Address;    // address (indexed)
}

// Union type for all event types
export type HypermapEvent = 
  | MintEvent 
  | FactEvent 
  | NoteEvent 
  | GeneEvent 
  | TransferEvent 
  | ZeroEvent 
  | UpgradedEvent;

// Hypermap Entry type
export interface HypermapEntry {
  namehash: Bytes32;               // bytes32 - entry identifier
  label: string;                   // Human-readable label
  parentHash: Bytes32;             // bytes32 - parent entry
  fullName?: string;               // Fully qualified name
  owner?: Address;                 // address - owner of the entry
  gene?: Address;                  // address - associated gene contract
  notes: Record<string, any>;      // Map of notes
  facts: Record<string, any>;      // Map of facts
  children: Bytes32[];             // Array of child namehashes
  creationBlock: number;           // Block number when created
  lastUpdateBlock: number;         // Block number of last update
}

