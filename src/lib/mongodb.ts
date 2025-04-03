import { MongoClient, Db } from 'mongodb';
import mongoose from 'mongoose';
import { 
  HypermapEvent, MintEvent, FactEvent, NoteEvent, 
  GeneEvent, TransferEvent, HypermapEntry 
} from '../types';
import { HypermapEntryModel, HypermapEventModel, initDatabase } from '../models';
import { ROOT_HASH } from '../constants';

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

// Client setup logic for development vs production
if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
    _mongoose_connected?: boolean;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
  
  // Setup mongoose connection if not already connected
  if (!globalWithMongo._mongoose_connected) {
    mongoose.connect(uri).then(() => {
      console.log('Mongoose connected successfully');
      globalWithMongo._mongoose_connected = true;
      initDatabase();
    });
  }
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
  
  // Setup mongoose connection
  mongoose.connect(uri).then(() => {
    console.log('Mongoose connected successfully');
    initDatabase();
  });
}

// Export a module-scoped MongoClient promise
export default clientPromise;

// Get a database instance
export async function getDbInstance(): Promise<Db> {
  const client = await clientPromise;
  return client.db();
}

// Store processed events in MongoDB
export async function storeEvents(events: HypermapEvent[]): Promise<void> {
  if (events.length === 0) return;
  
  try {
    await HypermapEventModel.insertMany(events);
    console.log(`Stored ${events.length} events in the database`);
  } catch (error) {
    console.error('Error storing events:', error);
    throw error;
  }
}

// Process events to build/update namespace entries
export async function processEventsToEntries(events: HypermapEvent[]): Promise<void> {
  if (events.length === 0) return;
  
  for (const event of events) {
    try {
      switch (event.eventType) {
        case 'Mint':
          await processMintEvent(event);
          break;
        case 'Fact':
          await processFactEvent(event);
          break;
        case 'Note':
          await processNoteEvent(event);
          break;
        case 'Gene':
          await processGeneEvent(event);
          break;
        case 'Transfer':
          await processTransferEvent(event);
          break;
        // Other event types can be added as needed
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


// Build full names for entries based on their hierarchy
export async function buildFullNames() {
  // Get all entries without full names
  const entries = await HypermapEntryModel.find({ fullName: { $exists: false } });
  
  for (const entry of entries) {
    await buildFullNameForEntry(entry.namehash);
  }
}

// Build full name for a single entry
async function buildFullNameForEntry(namehash: string): Promise<string> {
  const entry = await HypermapEntryModel.findOne({ namehash });
  
  if (!entry) {
    return '';
  }
  
  // If fullName already exists, return it
  if (entry.fullName) {
    return entry.fullName;
  }
  
  // If this is the root hash, it has no name
  if (namehash === ROOT_HASH) {
    await HypermapEntryModel.updateOne(
      { namehash }, 
      { $set: { fullName: '' } }
    );
    return '';
  }
  
  // Get parent's full name
  const parentFullName = await buildFullNameForEntry(entry.parentHash);
  
  // Build full name
  const fullName = parentFullName ? `${parentFullName}/${entry.label}` : entry.label;
  
  // Update the entry
  await HypermapEntryModel.updateOne(
    { namehash }, 
    { $set: { fullName } }
  );
  
  return fullName;
}