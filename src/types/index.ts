import { ethers } from 'ethers';

// Base event interface
export interface BaseHypermapEvent {
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  timestamp?: number;
}

// Event types based on the plan
export interface MintEvent extends BaseHypermapEvent {
  eventType: 'Mint';
  parenthash: string;
  childhash: string;
  labelhash: string;
  label: string;
}

export interface FactEvent extends BaseHypermapEvent {
  eventType: 'Fact';
  parenthash: string;
  facthash: string;
  labelhash: string;
  label: string;
  data: string;
}

export interface NoteEvent extends BaseHypermapEvent {
  eventType: 'Note';
  parenthash: string;
  notehash: string;
  labelhash: string;
  label: string;
  data: string;
}

export interface GeneEvent extends BaseHypermapEvent {
  eventType: 'Gene';
  entry: string;
  gene: string;
}

export interface TransferEvent extends BaseHypermapEvent {
  eventType: 'Transfer';
  from: string;
  to: string;
  id: string;
}

export interface ZeroEvent extends BaseHypermapEvent {
  eventType: 'Zero';
  zeroTba: string;
}

export interface UpgradedEvent extends BaseHypermapEvent {
  eventType: 'Upgraded';
  implementation: string;
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
  namehash: string;
  label: string;
  parentHash: string;
  fullName?: string;
  owner?: string;
  gene?: string;
  notes: Record<string, any>;
  facts: Record<string, any>;
  children: string[];
  creationBlock: number;
  lastUpdateBlock: number;
}

// Event Processor Status
export interface IndexingStatus {
  lastProcessedBlock: number;
  indexingInProgress: boolean;
  startTime?: Date;
  endTime?: Date;
  eventsProcessed: number;
  errors: string[];
}