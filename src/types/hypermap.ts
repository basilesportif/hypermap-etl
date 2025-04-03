// Types for HyperMap namespace state

// Note or Fact entry
export interface NoteOrFact {
  data: any; // Interpreted data
  rawData: string; // Original hex data
  blockNumber: number;
  txHash: string;
  logIndex: number;
  hash: string; // notehash or facthash
}

// Namespace entry structure
export interface NamespaceEntry {
  namehash: string;
  label: string;
  parentHash: string | null;
  fullName: string;
  owner: string | null;
  gene: string | null;
  notes: Record<string, NoteOrFact[]>;
  facts: Record<string, NoteOrFact[]>;
  children: string[];
  creationBlock: number;
  lastUpdateBlock: number;
}

// Lookup mapping for names
export interface NameLookup {
  [hash: string]: {
    label: string;
    parentHash: string | null;
  };
}

// State tracker for indexing process
export interface IndexingState {
  lastProcessedBlock: number;
  lastSavedBlock: number;
  chainId: number;
  contractAddress: string;
}

// HyperMap namespace state
export interface HyperMapState {
  entries: Record<string, NamespaceEntry>;
  nameLookup: NameLookup;
  indexingState: IndexingState;
}

// Contract configuration
export interface ContractConfig {
  address: string;
  startBlock: number;
  abi: any[];
}

// Constants
export const ROOT_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';