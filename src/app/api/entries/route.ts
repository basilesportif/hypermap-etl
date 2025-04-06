import { NextRequest, NextResponse } from 'next/server';
import { HypermapEntryModel } from '../../../models';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const parentHash = searchParams.get('parentHash');
    const label = searchParams.get('label');
    const namehash = searchParams.get('namehash');
    const owner = searchParams.get('owner');
    
    // Build query
    const query: Record<string, any> = {};
    if (parentHash) query.parentHash = parentHash;
    if (label) query.label = { $regex: label, $options: 'i' };
    if (namehash) query.namehash = namehash;
    if (owner) query.owner = owner;
    
    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Execute query
    const [entries, total] = await Promise.all([
      HypermapEntryModel.find(query)
        .sort({ creationBlock: -1 })
        .skip(skip)
        .limit(limit),
      HypermapEntryModel.countDocuments(query)
    ]);
    
    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    
    return NextResponse.json({
      success: true,
      data: entries,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error getting entries:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}