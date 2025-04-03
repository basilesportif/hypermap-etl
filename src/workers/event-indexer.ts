import { processEventsInChunks } from '../lib/blockchain';
import { storeEvents, processEventsToEntries, buildFullNames } from '../lib/mongodb';
import { HypermapEvent } from '../types';
import { DEFAULT_START_BLOCK } from '../constants';

// Process callback to handle events
const handleEvents = async (events: HypermapEvent[]): Promise<void> => {
  // Store raw events
  await storeEvents(events);
  
  // Process events into namespace entries
  await processEventsToEntries(events);
};

// Track indexing state through the status API
import { updateIndexingStatus } from '../app/api/indexer/status/route';

// Start the indexing process
export async function startIndexing(
  fromBlockOverride?: number,
  toBlockOverride?: number
): Promise<void> {
  // Get current status from the API via its imported state
  const { indexingInProgress, lastProcessedBlock } = await import('../app/api/indexer/status/route')
    .then(module => module.indexingStatus);
  
  if (indexingInProgress) {
    console.log('Indexing is already in progress');
    return;
  }
  
  // Determine block range
  const startBlock = fromBlockOverride || lastProcessedBlock;
  const endBlock = toBlockOverride || 'latest';
  
  try {
    // Update status to indicate indexing has started
    updateIndexingStatus({ 
      indexingInProgress: true,
      eventsProcessed: 0
    });
    
    console.log(`Starting indexing from block ${startBlock} to ${endBlock}`);
    
    let processedEvents = 0;
    
    // Process events in chunks with an event count callback
    await processEventsInChunks(
      startBlock,
      endBlock === 'latest' ? await getCurrentBlockNumber() : endBlock,
      async (events) => {
        await handleEvents(events);
        processedEvents += events.length;
        updateIndexingStatus({ eventsProcessed: processedEvents });
      }
    );
    
    // Build full names for entries
    await buildFullNames();
    
    // Update last processed block
    const finalBlock = endBlock === 'latest' ? await getCurrentBlockNumber() : endBlock;
    
    // Update status to indicate indexing is complete
    updateIndexingStatus({
      lastProcessedBlock: finalBlock,
      indexingInProgress: false
    });
    
    console.log(`Indexing completed up to block ${finalBlock}`);
  } catch (error) {
    console.error('Error during indexing:', error);
    
    // Update status to indicate indexing has failed
    updateIndexingStatus({ 
      indexingInProgress: false
    });
  }
}

// Get current block number
async function getCurrentBlockNumber(): Promise<number> {
  try {
    const { getProvider } = await import('../lib/blockchain');
    const provider = getProvider();
    const blockNumber = await provider.getBlockNumber();
    return blockNumber;
  } catch (error) {
    console.error('Error getting current block number:', error);
    throw error;
  }
}

// Listen for new events in real-time
export async function listenForNewEvents(): Promise<void> {
  try {
    const { listenForEvents } = await import('../lib/blockchain');
    
    console.log('Starting real-time event listener');
    
    // Start listening for events
    listenForEvents();
  } catch (error) {
    console.error('Error setting up event listener:', error);
    throw error;
  }
}