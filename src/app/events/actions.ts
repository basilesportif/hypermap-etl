'use server';

import mongoose from 'mongoose';
import { HypermapEventModel } from '../../models';
import { GetEventsParams, GetEventsResponse } from '../../types';
import { initMongoConnection } from '../../lib/services/mongodb';

/**
 * @function getEvents
 * @description Fetches events from the database based on provided filters and pagination parameters
 * @param {GetEventsParams} params - Parameters for filtering and pagination
 * @returns {Promise<GetEventsResponse>} Events and total count matching the filters
 */
export async function getEvents(params: GetEventsParams): Promise<GetEventsResponse> {
  try {
    // Initialize MongoDB connection if not already connected
    if (mongoose.connection.readyState !== 1) {
      await initMongoConnection(process.env.MONGODB_URI as string);
    }

    // Set default values and validate parameters
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20)); // Cap at 100 items per page
    const skip = (page - 1) * limit;

    // Build query filter
    const queryFilter: any = {};

    // Apply type filter if provided and not 'All'
    if (params.type && params.type !== 'All') {
      queryFilter.eventType = params.type;
    }

    // Apply date filter if provided
    if (params.startDate) {
      // Convert YYYY-MM-DD to Unix timestamp (seconds)
      const startDate = new Date(params.startDate);
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      queryFilter.timestamp = { $gte: startTimestamp };
    }

    // Execute queries
    const [events, totalCount] = await Promise.all([
      HypermapEventModel.find(queryFilter)
        .sort({ blockNumber: -1, logIndex: -1 }) // Sort newest first
        .skip(skip)
        .limit(limit)
        .lean(),
      HypermapEventModel.countDocuments(queryFilter)
    ]);

    return {
      events,
      totalCount
    };
  } catch (error) {
    console.error('Error fetching events:', error);
    throw new Error('Failed to fetch events');
  }
}