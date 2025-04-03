// Event types based on the contract ABI

// Base type for all events
export interface BaseEvent {
  eventName: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

// Mint event parameters
export interface MintEvent extends BaseEvent {
  eventName: 'Mint';
  parameters: {
    parenthash: string;
    childhash: string;
    labelhash: string;
    label: string;
  };
}

// Fact event parameters
export interface FactEvent extends BaseEvent {
  eventName: 'Fact';
  parameters: {
    parenthash: string;
    facthash: string;
    labelhash: string;
    label: string;
    data: string;
  };
}

// Note event parameters
export interface NoteEvent extends BaseEvent {
  eventName: 'Note';
  parameters: {
    parenthash: string;
    notehash: string;
    labelhash: string;
    label: string;
    data: string;
  };
}

// Gene event parameters
export interface GeneEvent extends BaseEvent {
  eventName: 'Gene';
  parameters: {
    entry: string;
    gene: string;
  };
}

// Transfer event parameters
export interface TransferEvent extends BaseEvent {
  eventName: 'Transfer';
  parameters: {
    from: string;
    to: string;
    id: string;
  };
}

// Zero event parameters
export interface ZeroEvent extends BaseEvent {
  eventName: 'Zero';
  parameters: {
    zeroTba: string;
  };
}

// Upgraded event parameters
export interface UpgradedEvent extends BaseEvent {
  eventName: 'Upgraded';
  parameters: {
    implementation: string;
  };
}

// Union type for all event types
export type HyperMapEvent =
  | MintEvent
  | FactEvent
  | NoteEvent
  | GeneEvent
  | TransferEvent
  | ZeroEvent
  | UpgradedEvent;

// Event processor configuration
export interface EventProcessorConfig {
  contractAddress: string;
  rpcUrl: string;
  startBlock: number;
  chunkSize: number;
  baseDelayMs: number;
}