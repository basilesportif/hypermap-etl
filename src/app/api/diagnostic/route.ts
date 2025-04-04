import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { HypermapEventModel, HypermapEntryModel } from '../../../models';
import clientPromise from '../../../lib/mongodb';

export async function GET() {
  try {
    // Check MongoDB connection
    const isConnected = mongoose.connection.readyState === 1;
    
    // Get collections info
    const client = await clientPromise;
    const db = client.db();
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    // Count documents in each collection
    let eventCount = 0;
    let entryCount = 0;
    let eventTypes: Record<string, number> = {};
    
    if (isConnected) {
      try {
        eventCount = await HypermapEventModel.countDocuments();
        entryCount = await HypermapEntryModel.countDocuments();
        
        // Count by event type
        const eventTypeCounts = await HypermapEventModel.aggregate([
          { $group: { _id: "$eventType", count: { $sum: 1 } } }
        ]);
        
        eventTypeCounts.forEach((item: any) => {
          eventTypes[item._id] = item.count;
        });
      } catch (err) {
        console.error('Error counting documents:', err);
      }
    }
    
    return NextResponse.json({
      success: true,
      mongodb: {
        uri: process.env.MONGODB_URI,
        isConnected,
        collections: collectionNames,
        models: {
          events: {
            count: eventCount,
            byType: eventTypes
          },
          entries: {
            count: entryCount
          }
        }
      },
      environment: {
        rpcUrl: process.env.BASE_RPC_URL?.substring(0, 20) + '...',
        startBlock: process.env.START_BLOCK,
        nodeEnv: process.env.NODE_ENV,
        envFiles: {
          dotenv: process.env.MONGODB_URI?.substring(0, 10) + '...',
          dotenvLocal: process.env.MONGODB_URI?.includes('mongodb+srv') ? 'Using Atlas MongoDB' : 'Using Local MongoDB'
        }
      }
    });
  } catch (error) {
    console.error('Diagnostic error:', error);
    return NextResponse.json({
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    }, { 
      status: 500 
    });
  }
}