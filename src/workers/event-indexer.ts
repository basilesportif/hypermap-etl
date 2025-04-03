import { processEventsInChunks } from '../lib/blockchain';
import { storeEvents, processEventsToEntries, getIndexingStatus, updateIndexingStatus, buildFullNames } from '../lib/mongodb';
import { HypermapEvent } from '../types';
import { DEFAULT_START_BLOCK } from '../constants';

// Process callback to handle events
const handleEvents = async (events: HypermapEvent[]): Promise<void> => {
  // Store raw events
  await storeEvents(events);
  
  // Process events into namespace entries
  await processEventsToEntries(events);
};

// Start the indexing process
export async function startIndexing(
  fromBlockOverride?: number,
  toBlockOverride?: number
): Promise<void> {
  // Get current status
  const status = await getIndexingStatus();
  
  if (status?.indexingInProgress) {
    console.log('Indexing is already in progress');
    return;
  }
  
  // Determine block range
  const startBlock = fromBlockOverride || (status?.lastProcessedBlock ? status.lastProcessedBlock + 1 : DEFAULT_START_BLOCK);
  const endBlock = toBlockOverride || 'latest';
  
  try {
    // Update status to indicate indexing has started
    await updateIndexingStatus(startBlock - 1, true);
    
    console.log(`Starting indexing from block ${startBlock} to ${endBlock}`);
    
    // Process events in chunks
    await processEventsInChunks(
      startBlock,
      endBlock === 'latest' ? await getCurrentBlockNumber() : endBlock,
      handleEvents
    );
    
    // Build full names for entries
    await buildFullNames();
    
    // Update status to indicate indexing is complete
    const finalBlock = endBlock === 'latest' ? await getCurrentBlockNumber() : endBlock;
    await updateIndexingStatus(finalBlock, false);
    
    console.log(`Indexing completed up to block ${finalBlock}`);
  } catch (error) {
    console.error('Error during indexing:', error);
    
    // Update status to indicate indexing has failed
    await updateIndexingStatus(
      status?.lastProcessedBlock || startBlock - 1,
      false,
      0,
      [error instanceof Error ? error.message : String(error)]
    );
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