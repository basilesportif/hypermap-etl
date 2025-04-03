import { Schema, model, models, Document, Model } from 'mongoose';

// Interface for fact/note entries associated with a namespace
interface INoteOrFact {
  data: any; // interpreted data
  rawData: string; // original hex data
  blockNumber: number;
  txHash: string;
  logIndex: number;
  hash: string; // notehash or facthash
}

// Interface for namespace entries
export interface INamespaceEntry extends Document {
  namehash: string; // Primary key
  label: string;
  parentHash: string;
  fullName: string;
  owner: string | null;
  gene: string | null;
  notes: Record<string, INoteOrFact[]>;
  facts: Record<string, INoteOrFact[]>;
  children: string[];
  creationBlock: number;
  lastUpdateBlock: number;
}

// Schema for notes/facts
const NoteOrFactSchema = new Schema<INoteOrFact>({
  data: { type: Schema.Types.Mixed },
  rawData: { type: String, required: true },
  blockNumber: { type: Number, required: true },
  txHash: { type: String, required: true },
  logIndex: { type: Number, required: true },
  hash: { type: String, required: true },
});

// Schema for namespace entries
const NamespaceEntrySchema = new Schema<INamespaceEntry>(
  {
    namehash: { type: String, required: true, unique: true },
    label: { type: String, default: '' },
    parentHash: { type: String, index: true },
    fullName: { type: String, index: true },
    owner: { type: String, sparse: true, index: true },
    gene: { type: String, sparse: true, index: true },
    notes: { type: Map, of: [NoteOrFactSchema], default: {} },
    facts: { type: Map, of: [NoteOrFactSchema], default: {} },
    children: { type: [String], default: [] },
    creationBlock: { type: Number, required: true },
    lastUpdateBlock: { type: Number, required: true },
  },
  {
    timestamps: true,
  }
);

// Schema for metadata cache
export interface IMetadataCache extends Document {
  uri: string;
  hash: string;
  content: Record<string, any>;
  lastFetched: Date;
}

const MetadataCacheSchema = new Schema<IMetadataCache>(
  {
    uri: { type: String, required: true, unique: true },
    hash: { type: String, required: true },
    content: { type: Schema.Types.Mixed, required: true },
    lastFetched: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Initialize models
export const NamespaceEntry: Model<INamespaceEntry> = models.NamespaceEntry || model<INamespaceEntry>('NamespaceEntry', NamespaceEntrySchema);
export const MetadataCache: Model<IMetadataCache> = models.MetadataCache || model<IMetadataCache>('MetadataCache', MetadataCacheSchema);