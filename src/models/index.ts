import mongoose from 'mongoose';
import { HypermapEventSchema, HypermapEntrySchema, IndexingStatusSchema } from '../schemas';
import { HypermapEvent, HypermapEntry, IndexingStatus } from '../types';

// Models
export const HypermapEventModel = (mongoose.models.HypermapEvent as mongoose.Model<HypermapEvent>) || 
  mongoose.model<HypermapEvent>('HypermapEvent', HypermapEventSchema);

export const HypermapEntryModel = (mongoose.models.HypermapEntry as mongoose.Model<HypermapEntry>) || 
  mongoose.model<HypermapEntry>('HypermapEntry', HypermapEntrySchema);

export const IndexingStatusModel = (mongoose.models.IndexingStatus as mongoose.Model<IndexingStatus>) || 
  mongoose.model<IndexingStatus>('IndexingStatus', IndexingStatusSchema);

// Initialize the database with proper indexes
export async function initDatabase() {
  // Ensure indexes are created
  await HypermapEntryModel.createIndexes();
  await HypermapEventModel.createIndexes();
  await IndexingStatusModel.createIndexes();

  // Create default indexing status if it doesn't exist
  const statusCount = await IndexingStatusModel.countDocuments();
  if (statusCount === 0) {
    const startBlock = process.env.START_BLOCK ? parseInt(process.env.START_BLOCK) : 27270000;
    await IndexingStatusModel.create({
      lastProcessedBlock: startBlock - 1,
      indexingInProgress: false,
      eventsProcessed: 0,
      errors: []
    });
  }
}