'use server';

import mongoose from 'mongoose';
import { initMongoConnection } from '../../lib/services/mongodb';
import { HypermapEventModel } from '../../models';

interface EventCount {
  type: string;
  count: number;
  percentage: number;
}

interface StatusData {
  events: {
    total: number;
    byType: EventCount[];
  };
  processing: {
    lastBlock: number;
    lastBlockTime: string;
    hoursAgo: number;
  };
}

export async function getStatus(): Promise<StatusData> {
  // Initialize MongoDB connection if not already connected
  if (mongoose.connection.readyState !== 1) {
    await initMongoConnection(process.env.MONGODB_URI as string);
  }
  
  try {
    // 1. Count events by type
    const eventTypes = ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'];
    const eventCountsPromises = eventTypes.map(async (type) => {
      const count = await HypermapEventModel.countDocuments({ eventType: type });
      return { type, count };
    });
    
    const eventCounts = await Promise.all(eventCountsPromises);
    
    // Calculate total events
    const totalEvents = eventCounts.reduce((sum, { count }) => sum + count, 0);
    
    // Sort by count (descending) and add percentage
    const byType: EventCount[] = eventCounts
      .sort((a, b) => b.count - a.count)
      .map(({ type, count }) => ({
        type,
        count,
        percentage: totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0
      }));
    
    // 3. Get last block processed
    const lastEvent = await HypermapEventModel.findOne()
      .sort({ blockNumber: -1 })
      .select('blockNumber timestamp')
      .lean();
    
    let lastBlock = 0;
    let lastBlockTime = new Date().toISOString();
    let hoursAgo = 0;
    
    if (lastEvent) {
      lastBlock = lastEvent.blockNumber;
      
      if (lastEvent.timestamp) {
        const lastBlockDate = new Date(lastEvent.timestamp * 1000);
        lastBlockTime = lastBlockDate.toISOString();
        
        const now = new Date();
        const diffMs = now.getTime() - lastBlockDate.getTime();
        hoursAgo = Math.round(diffMs / (1000 * 60 * 60));
      }
    }
    
    // Return the status data
    return {
      events: {
        total: totalEvents,
        byType
      },
      processing: {
        lastBlock,
        lastBlockTime,
        hoursAgo
      }
    };
  } catch (error) {
    console.error('Error getting status:', error);
    throw new Error('Failed to get status data');
  }
}