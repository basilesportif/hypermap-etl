import { NextRequest, NextResponse } from 'next/server';
import { HypermapEventModel } from '../../../../models';
import { processEventsToEntries } from '../../../../lib/mongodb';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { namehash } = data;
    
    // Find events by the namehash
    const query: Record<string, any> = {};
    
    if (namehash) {
      query.$or = [
        // Mint events (as child)
        { eventType: 'Mint', childhash: namehash },
        // Mint events (as parent)
        { eventType: 'Mint', parenthash: namehash },
        // Fact events
        { eventType: 'Fact', parenthash: namehash },
        // Note events
        { eventType: 'Note', parenthash: namehash },
        // Gene events
        { eventType: 'Gene', entry: namehash },
        // Transfer events
        { eventType: 'Transfer', id: namehash }
      ];
    }
    
    const events = await HypermapEventModel.find(query).sort({ blockNumber: 1, logIndex: 1 });
    
    // Process the events
    await processEventsToEntries(events);
    
    return NextResponse.json({
      success: true,
      message: `Processed ${events.length} events`,
      eventsByType: events.reduce((acc: Record<string, number>, event) => {
        acc[event.eventType] = (acc[event.eventType] || 0) + 1;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error processing events:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}