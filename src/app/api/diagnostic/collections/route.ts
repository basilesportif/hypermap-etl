import { NextResponse } from 'next/server';
import clientPromise from '../../../../lib/mongodb';

export async function GET() {
  try {
    // Get MongoDB connection
    const client = await clientPromise;
    const db = client.db();
    
    // Get collection stats
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    // Get collection counts
    const collectionCounts = await Promise.all(
      collectionNames.map(async (name) => {
        const count = await db.collection(name).countDocuments();
        return { name, count };
      })
    );
    
    // Get hypermapevents by type if it exists
    let eventTypes = {};
    if (collectionNames.includes('hypermapevents')) {
      try {
        const eventTypeCounts = await db.collection('hypermapevents').aggregate([
          { $group: { _id: "$eventType", count: { $sum: 1 } } }
        ]).toArray();
        
        eventTypeCounts.forEach((item) => {
          eventTypes[item._id] = item.count;
        });
      } catch (err) {
        console.error('Error counting event types:', err);
      }
    }
    
    return NextResponse.json({
      success: true,
      mongodb: {
        uri: process.env.MONGODB_URI?.substring(0, 10) + '...',
        usingAtlas: process.env.MONGODB_URI?.includes('mongodb+srv'),
        collections: collectionCounts,
        eventTypes
      }
    });
  } catch (error) {
    console.error('Error getting collections:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}