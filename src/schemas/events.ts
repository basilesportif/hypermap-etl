import { Schema, model, models, Document, Model } from 'mongoose';

// Raw blockchain event interface
export interface IRawEvent extends Document {
  eventName: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  parameters: Record<string, any>;
  timestamp: Date;
}

// Schema for raw blockchain events
const RawEventSchema = new Schema<IRawEvent>(
  {
    eventName: { type: String, required: true, index: true },
    blockNumber: { type: Number, required: true, index: true },
    transactionHash: { type: String, required: true, index: true },
    logIndex: { type: Number, required: true },
    parameters: { type: Schema.Types.Mixed, required: true },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
  }
);

// Create compound index for efficient querying
RawEventSchema.index({ blockNumber: 1, logIndex: 1 }, { unique: true });

// Schema for tracking indexing state
export interface IIndexState extends Document {
  lastProcessedBlock: number;
  lastSavedBlock: number;
  chainId: number;
  contractAddress: string;
  updatedAt: Date;
}

const IndexStateSchema = new Schema<IIndexState>(
  {
    lastProcessedBlock: { type: Number, required: true },
    lastSavedBlock: { type: Number, required: true },
    chainId: { type: Number, required: true },
    contractAddress: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Initialize models using Mongoose's models cache to prevent model recompilation errors
export const RawEvent: Model<IRawEvent> = models.RawEvent || model<IRawEvent>('RawEvent', RawEventSchema);
export const IndexState: Model<IIndexState> = models.IndexState || model<IIndexState>('IndexState', IndexStateSchema);