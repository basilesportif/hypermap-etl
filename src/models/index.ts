import mongoose from 'mongoose';
import { HypermapEventSchema, HypermapEntrySchema } from '../schemas';
import { HypermapEvent, HypermapEntry } from '../types';

// Models
export const HypermapEventModel = (mongoose.models.HypermapEvent as mongoose.Model<HypermapEvent>) || 
  mongoose.model<HypermapEvent>('HypermapEvent', HypermapEventSchema);

export const HypermapEntryModel = (mongoose.models.HypermapEntry as mongoose.Model<HypermapEntry>) || 
  mongoose.model<HypermapEntry>('HypermapEntry', HypermapEntrySchema);

// Initialize the database with proper indexes
export async function initDatabase() {
  // Ensure indexes are created
  await HypermapEntryModel.createIndexes();
  await HypermapEventModel.createIndexes();
}