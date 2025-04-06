import { NextRequest, NextResponse } from 'next/server';
import { HypermapEntryModel } from '../../../../models';

export async function GET(
  req: NextRequest,
  { params }: { params: { namehash: string } }
) {
  try {
    const namehash = params.namehash;
    
    // Find the entry
    const entry = await HypermapEntryModel.findOne({ namehash });
    
    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'Entry not found' },
        { status: 404 }
      );
    }
    
    // Get children if requested
    const includeChildren = req.nextUrl.searchParams.get('includeChildren') === 'true';
    let children = [];
    
    if (includeChildren && entry.children.length > 0) {
      children = await HypermapEntryModel.find({
        namehash: { $in: entry.children }
      });
    }
    
    return NextResponse.json({
      success: true,
      data: entry,
      children: includeChildren ? children : undefined
    });
  } catch (error) {
    console.error('Error getting entry:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}