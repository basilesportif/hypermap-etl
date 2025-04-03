import { NextResponse } from 'next/server';
import { DEFAULT_START_BLOCK } from '../../../../constants';

// Type definition for indexing status
interface IndexingStatus {
  lastProcessedBlock: number;
  indexingInProgress: boolean;
  startTime: Date | null;
  endTime: Date | null;
  eventsProcessed: number;
}

// Keep track of indexing status in memory
export let indexingStatus: IndexingStatus = {
  lastProcessedBlock: DEFAULT_START_BLOCK,
  indexingInProgress: false,
  startTime: null,
  endTime: null,
  eventsProcessed: 0
};

// Allow other modules to update the status
export function updateIndexingStatus(update: Partial<typeof indexingStatus>) {
  indexingStatus = { ...indexingStatus, ...update };
  
  // Update timestamps
  if (update.indexingInProgress === true && !indexingStatus.startTime) {
    indexingStatus.startTime = new Date();
  } else if (update.indexingInProgress === false && indexingStatus.startTime) {
    indexingStatus.endTime = new Date();
  }
}

export async function GET() {
  try {
    return NextResponse.json({ success: true, status: indexingStatus });
  } catch (error) {
    console.error('Error getting indexer status:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}