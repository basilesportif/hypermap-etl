/**
 * MongoDB Service
 * 
 * Provides functions for interacting with MongoDB database.
 * Handles connection pooling, collection access, and data operations.
 */

import { MongoClient, Db } from 'mongodb';
import mongoose from 'mongoose';
import { HypermapEvent, MintEvent, FactEvent, NoteEvent, 
         GeneEvent, TransferEvent, HypermapEntry } from '../../types/index.js';
import { ROOT_HASH } from '../../constants.js';

// MongoDB Model types (will be imported from models)
let HypermapEventModel: any;
let HypermapEntryModel: any;

/**
 * Initialize MongoDB connection
 */
export async function initMongoConnection(uri: string): Promise<void> {
  if (!uri) {
    throw new Error('MongoDB URI is required');
  }
  
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    // Import models after connection to avoid model overwrite issues
    const { HypermapEventModel: EventModel, HypermapEntryModel: EntryModel } = 
      await import('../../models/index.js');
    
    HypermapEventModel = EventModel;
    HypermapEntryModel = EntryModel;
    
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}

/**
 * Store events in MongoDB
 */
export async function storeEvents(events: HypermapEvent[]): Promise<void> {
  if (!events.length) return;
  
  try {
    // Validate models are initialized
    if (!HypermapEventModel) {
      throw new Error('MongoDB models not initialized');
    }
    
    // Insert events
    const result = await HypermapEventModel.insertMany(events, { 
      ordered: false, // Continue processing if some docs fail
      rawResult: true  // Get detailed result info
    });
    
    console.log(`Stored ${result.insertedCount} events in MongoDB`);
  } catch (error: any) {
    // Handle duplicate key errors
    if (error.code === 11000) {
      console.log(`Some events already exist in database, skipped duplicates`);
    } else {
      console.error(`Error storing events:`, error);
    }
  }
}

/**
 * Get events for an entry
 */
export async function getEventsForEntry(namehash: string): Promise<HypermapEvent[]> {
  // Validate models are initialized
  if (!HypermapEventModel) {
    throw new Error('MongoDB models not initialized');
  }
  
  // Query all event types that might reference this entry
  const events = await HypermapEventModel.find({
    $or: [
      { eventType: 'Mint', parenthash: namehash },
      { eventType: 'Mint', childhash: namehash },
      { eventType: 'Fact', parenthash: namehash },
      { eventType: 'Note', parenthash: namehash },
      { eventType: 'Gene', entry: namehash },
      { eventType: 'Transfer', id: namehash }
    ]
  }).sort({ blockNumber: 1, logIndex: 1 }).lean();
  
  return events;
}

/**
 * Get an entry by namehash
 */
export async function getEntry(namehash: string): Promise<HypermapEntry | null> {
  // Validate models are initialized
  if (!HypermapEntryModel) {
    throw new Error('MongoDB models not initialized');
  }
  
  const entry = await HypermapEntryModel.findOne({ namehash }).lean();
  return entry;
}

/**
 * Process events to update entries
 * This function updates the entry database based on events
 */
export async function processEventsToEntries(events: HypermapEvent[]): Promise<void> {
  if (!events.length) return;
  
  // Validate models are initialized
  if (!HypermapEntryModel) {
    throw new Error('MongoDB models not initialized');
  }
  
  for (const event of events) {
    try {
      switch (event.eventType) {
        case 'Mint':
          await processMintEvent(event as MintEvent);
          break;
        case 'Fact':
          await processFactEvent(event as FactEvent);
          break;
        case 'Note':
          await processNoteEvent(event as NoteEvent);
          break;
        case 'Gene':
          await processGeneEvent(event as GeneEvent);
          break;
        case 'Transfer':
          await processTransferEvent(event as TransferEvent);
          break;
      }
    } catch (error) {
      console.error(`Error processing ${event.eventType} event:`, error);
    }
  }
}

// Process a Mint event
async function processMintEvent(event: MintEvent): Promise<void> {
  // Check if parent entry exists, if not, create root entry
  let parentEntry = await HypermapEntryModel.findOne({ namehash: event.parenthash });
  
  if (!parentEntry && event.parenthash !== ROOT_HASH) {
    // Create parent entry if it doesn't exist and isn't the root hash
    parentEntry = await HypermapEntryModel.create({
      namehash: event.parenthash,
      label: '[unknown]', // Placeholder until we find the actual label
      parentHash: ROOT_HASH, // Assuming unknown parents are attached to root
      children: [],
      notes: {},
      facts: {},
      creationBlock: event.blockNumber,
      lastUpdateBlock: event.blockNumber
    });
  }
  
  // Create child entry or update if it already exists
  const childEntry = await HypermapEntryModel.findOneAndUpdate(
    { namehash: event.childhash },
    {
      $setOnInsert: {
        namehash: event.childhash,
        label: event.label,
        parentHash: event.parenthash,
        children: [],
        notes: {},
        facts: {},
        creationBlock: event.blockNumber,
      },
      $set: {
        lastUpdateBlock: event.blockNumber
      }
    },
    { upsert: true, new: true }
  );
  
  // Update parent's children array if parent exists
  if (parentEntry) {
    await HypermapEntryModel.updateOne(
      { namehash: event.parenthash },
      { 
        $addToSet: { children: event.childhash },
        $set: { lastUpdateBlock: event.blockNumber }
      }
    );
  }
}

// Process a Fact event
async function processFactEvent(event: FactEvent): Promise<void> {
  // Find the entry this fact is attached to
  const entry = await HypermapEntryModel.findOne({ namehash: event.parenthash });
  
  if (!entry) {
    console.warn(`Fact event references unknown entry: ${event.parenthash}`);
    return;
  }
  
  // Update the entry with the new fact
  await HypermapEntryModel.updateOne(
    { namehash: event.parenthash },
    { 
      $set: { 
        [`facts.${event.label}`]: event.data,
        lastUpdateBlock: event.blockNumber 
      }
    }
  );
}

// Process a Note event
async function processNoteEvent(event: NoteEvent): Promise<void> {
  // Find the entry this note is attached to
  const entry = await HypermapEntryModel.findOne({ namehash: event.parenthash });
  
  if (!entry) {
    console.warn(`Note event references unknown entry: ${event.parenthash}`);
    return;
  }
  
  // Update the entry with the new note
  await HypermapEntryModel.updateOne(
    { namehash: event.parenthash },
    { 
      $set: { 
        [`notes.${event.label}`]: event.data,
        lastUpdateBlock: event.blockNumber 
      }
    }
  );
}

// Process a Gene event
async function processGeneEvent(event: GeneEvent): Promise<void> {
  // Update the entry with the new gene
  await HypermapEntryModel.updateOne(
    { namehash: event.entry },
    { 
      $set: { 
        gene: event.gene,
        lastUpdateBlock: event.blockNumber 
      }
    }
  );
}

// Process a Transfer event
async function processTransferEvent(event: TransferEvent): Promise<void> {
  // Convert BigNumber id to namehash (assuming id is a hex string of the namehash)
  const entryId = event.id;
  
  // Update the entry with the new owner
  await HypermapEntryModel.updateOne(
    { namehash: entryId },
    { 
      $set: { 
        owner: event.to,
        lastUpdateBlock: event.blockNumber 
      }
    }
  );
}