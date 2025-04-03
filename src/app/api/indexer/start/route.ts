import { NextRequest, NextResponse } from 'next/server';
import { startIndexing } from '../../../../workers/event-indexer';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { fromBlock, toBlock } = data;
    
    // Start indexing in a non-blocking way
    void startIndexing(
      fromBlock ? parseInt(fromBlock) : undefined,
      toBlock ? parseInt(toBlock) : undefined
    );
    
    return NextResponse.json({ success: true, message: 'Indexing started' });
  } catch (error) {
    console.error('Error starting indexer:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}