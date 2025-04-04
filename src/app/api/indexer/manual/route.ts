import { NextRequest, NextResponse } from 'next/server';
import { startIndexing } from '../../../../workers/event-indexer';
import { DEFAULT_START_BLOCK } from '../../../../constants';

export async function GET() {
  try {
    // Get the current status
    const { indexingStatus } = await import('../status/route');
    
    return NextResponse.json({ 
      success: true, 
      indexingStatus,
      instructions: {
        startIndexing: "POST to this endpoint with fromBlock and toBlock to start indexing",
        exampleBody: {
          fromBlock: DEFAULT_START_BLOCK,
          toBlock: DEFAULT_START_BLOCK + 10000  // Or "latest"
        }
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { fromBlock, toBlock } = data;
    
    // Validate parameters
    const startBlock = fromBlock ? parseInt(fromBlock) : DEFAULT_START_BLOCK;
    const endBlock = toBlock === "latest" ? "latest" : (toBlock ? parseInt(toBlock) : undefined);
    
    console.log(`Starting manual indexing from block ${startBlock} to ${endBlock || 'latest'}`);
    
    // Start indexing synchronously and wait for completion
    await startIndexing(startBlock, endBlock);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Indexing completed',
      fromBlock: startBlock,
      toBlock: endBlock
    });
  } catch (error) {
    console.error('Error starting indexer:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}