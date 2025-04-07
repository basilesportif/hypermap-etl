import { Schema } from 'mongoose';

// Event schema for all HyperMap events
export const HypermapEventSchema = new Schema({
  // Base event fields
  eventType: { type: String, required: true, index: true, enum: ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'] },
  blockNumber: { type: Number, required: true, index: true },
  blockHash: { type: String, required: true }, // Bytes32
  transactionHash: { type: String, required: true, index: true }, // Bytes32
  transactionIndex: { type: Number, required: true },
  logIndex: { type: Number, required: true },
  timestamp: { type: Number, index: true }, // Optional, indexed for date filtering
  
  // Mint event fields - bytes32 (indexed)
  parenthash: { type: String, sparse: true, index: true }, // Bytes32
  childhash: { type: String, sparse: true, index: true },  // Bytes32
  
  // Fact/Note event fields - bytes32 (indexed)
  facthash: { type: String, sparse: true, index: true },  // Bytes32
  notehash: { type: String, sparse: true, index: true },  // Bytes32
  
  // Common fields for various events
  labelhash: { type: String, sparse: true, index: true }, // Bytes (indexed) - hex string of raw bytes
  label: { type: String, sparse: true, index: true },     // String - UTF8 decoded from bytes
  data: { type: String, sparse: true },                   // Bytes - hex string of raw bytes
  
  // Gene event fields
  entry: { type: String, sparse: true, index: true },     // Bytes32 (indexed)
  gene: { type: String, sparse: true, index: true },      // Address (indexed)
  
  // Transfer event fields
  from: { type: String, sparse: true, index: true },      // Address (indexed)
  to: { type: String, sparse: true, index: true },        // Address (indexed)
  id: { type: String, sparse: true, index: true },        // uint256 (indexed) as string
  
  // Zero event fields
  zeroTba: { type: String, sparse: true, index: true },   // Address (indexed)
  
  // Upgraded event fields
  implementation: { type: String, sparse: true, index: true } // Address (indexed)
}, { 
  timestamps: true 
});

// Schema for HyperMap entries
export const HypermapEntrySchema = new Schema({
  namehash: { type: String, required: true, unique: true, index: true }, // Bytes32 - entry identifier
  label: { type: String, required: true, index: true },                  // Human-readable label (UTF8 string)
  parentHash: { type: String, required: true, index: true },             // Bytes32 - parent entry
  fullName: { type: String, sparse: true },                              // Fully qualified name
  owner: { type: String, sparse: true, index: true },                    // Address - owner of the entry
  gene: { type: String, sparse: true, index: true },                     // Address - associated gene contract
  notes: { type: Map, of: Schema.Types.Mixed, default: {} },             // Map of notes by label
  facts: { type: Map, of: Schema.Types.Mixed, default: {} },             // Map of facts by label
  children: { type: [String], default: [] },                             // Array of child namehashes (Bytes32[])
  creationBlock: { type: Number, required: true, index: true },          // Block number when created
  lastUpdateBlock: { type: Number, required: true }                      // Block number of last update
}, {
  timestamps: true
});

