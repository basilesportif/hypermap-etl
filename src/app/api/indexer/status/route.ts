import { NextResponse } from 'next/server';
import { getIndexingStatus } from '../../../../lib/mongodb';

export async function GET() {
  try {
    const status = await getIndexingStatus();
    
    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error('Error getting indexer status:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}