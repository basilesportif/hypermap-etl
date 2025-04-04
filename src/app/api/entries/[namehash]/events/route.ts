import { NextRequest, NextResponse } from 'next/server';
import { HypermapEventModel, HypermapEntryModel } from '../../../../../models';

export async function GET(
  req: NextRequest,
  { params }: { params: { namehash: string } }
) {
  try {
    const namehash = params.namehash;
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const eventType = searchParams.get('eventType');
    
    // Validate entry exists
    const entry = await HypermapEntryModel.findOne({ namehash });
    
    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'Entry not found' },
        { status: 404 }
      );
    }
    
    // Build query for events related to this entry
    const query: Record<string, any> = {
      $or: [
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
      ]
    };
    
    // Add event type filter if provided
    if (eventType) {
      query.$or = query.$or.filter(condition => condition.eventType === eventType);
    }
    
    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Execute query
    const [events, total] = await Promise.all([
      HypermapEventModel.find(query)
        .sort({ blockNumber: -1, logIndex: -1 })
        .skip(skip)
        .limit(limit),
      HypermapEventModel.countDocuments(query)
    ]);
    
    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    
    return NextResponse.json({
      success: true,
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error getting events:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}