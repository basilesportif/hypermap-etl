import { Schema } from 'mongoose';

// Event schema for all HyperMap events
export const HypermapEventSchema = new Schema({
  eventType: { type: String, required: true, index: true },
  blockNumber: { type: Number, required: true, index: true },
  blockHash: { type: String, required: true },
  transactionHash: { type: String, required: true, index: true },
  transactionIndex: { type: Number, required: true },
  logIndex: { type: Number, required: true },
  timestamp: { type: Number },
  
  // Mint event fields
  parenthash: { type: String, sparse: true, index: true },
  childhash: { type: String, sparse: true, index: true },
  
  // Fact/Note event fields
  facthash: { type: String, sparse: true },
  notehash: { type: String, sparse: true },
  
  // Common fields
  labelhash: { type: String, sparse: true },
  label: { type: String, sparse: true, index: true },
  data: { type: String, sparse: true },
  
  // Gene event fields
  entry: { type: String, sparse: true, index: true },
  gene: { type: String, sparse: true },
  
  // Transfer event fields
  from: { type: String, sparse: true, index: true },
  to: { type: String, sparse: true, index: true },
  id: { type: String, sparse: true },
  
  // Zero event fields
  zeroTba: { type: String, sparse: true },
  
  // Upgraded event fields
  implementation: { type: String, sparse: true }
}, { 
  timestamps: true 
});

// Schema for HyperMap entries
export const HypermapEntrySchema = new Schema({
  namehash: { type: String, required: true, unique: true, index: true },
  label: { type: String, required: true, index: true },
  parentHash: { type: String, required: true, index: true },
  fullName: { type: String, sparse: true },
  owner: { type: String, sparse: true, index: true },
  gene: { type: String, sparse: true },
  notes: { type: Map, of: Schema.Types.Mixed, default: {} },
  facts: { type: Map, of: Schema.Types.Mixed, default: {} },
  children: { type: [String], default: [] },
  creationBlock: { type: Number, required: true, index: true },
  lastUpdateBlock: { type: Number, required: true }
}, {
  timestamps: true
});

// Schema for indexing status
export const IndexingStatusSchema = new Schema({
  lastProcessedBlock: { type: Number, required: true },
  indexingInProgress: { type: Boolean, default: false },
  startTime: { type: Date },
  endTime: { type: Date },
  eventsProcessed: { type: Number, default: 0 },
  errors: { type: [String], default: [] }
}, {
  timestamps: true
});