'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getEvents } from './actions';
import { HypermapEvent, GetEventsParams } from '../../types';
import Link from 'next/link';

// Define constants
const EVENTS_PER_PAGE = 20;
const EVENT_TYPES = ['All', 'Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'];

/**
 * Format a timestamp to a readable date/time string
 */
function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Helper to display shortened hash values
 */
function shortenHash(hash: string): string {
  if (!hash) return '';
  return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
}

/**
 * Main Events page content component
 */
function EventsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // State
  const [events, setEvents] = useState<HypermapEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');

  // Effect to initialize state from URL params
  useEffect(() => {
    const page = parseInt(searchParams.get('page') || '1');
    const type = searchParams.get('type') || '';
    const startDate = searchParams.get('startDate') || '';
    
    setCurrentPage(page);
    setFilterType(type);
    setFilterStartDate(startDate);
  }, [searchParams]);

  // Fetch events from the server
  const fetchEvents = useCallback(async (page: number, type: string, startDate: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const params: GetEventsParams = {
        page: page,
        limit: EVENTS_PER_PAGE,
        type: type === 'All' ? undefined : type,
        startDate: startDate || undefined,
      };
      
      const result = await getEvents(params);
      setEvents(result.events);
      setTotalEvents(result.totalCount);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setError('Failed to fetch events. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Effect to fetch data when page or filters change
  useEffect(() => {
    fetchEvents(currentPage, filterType, filterStartDate);
  }, [currentPage, filterType, filterStartDate, fetchEvents]);

  // Handler for filter changes
  const handleFilterChange = () => {
    // Reset to page 1 when filters change
    const newPage = 1;
    setCurrentPage(newPage);
    
    // Update URL
    const params = new URLSearchParams();
    if (filterType && filterType !== 'All') params.set('type', filterType);
    if (filterStartDate) params.set('startDate', filterStartDate);
    params.set('page', newPage.toString());
    
    router.push(`/events?${params.toString()}`);
    // Fetching is triggered by useEffect dependency change
  };

  // Handler for page changes
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    
    // Update URL
    const params = new URLSearchParams();
    if (filterType && filterType !== 'All') params.set('type', filterType);
    if (filterStartDate) params.set('startDate', filterStartDate);
    params.set('page', newPage.toString());
    
    router.push(`/events?${params.toString()}`);
    // Fetching is triggered by useEffect dependency change
  };

  const totalPages = Math.ceil(totalEvents / EVENTS_PER_PAGE);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">HyperMap Events</h1>
        <Link href="/" className="text-blue-600 hover:underline">
          Back to Dashboard
        </Link>
      </div>

      {/* Filters Section */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-gray-100 rounded">
        {/* Type Filter Dropdown */}
        <div className="w-full md:w-auto">
          <label htmlFor="type-filter" className="block text-sm font-medium text-gray-700 mb-1">
            Event Type
          </label>
          <select
            id="type-filter"
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              // Don't call handleFilterChange here to avoid double-fetch
            }}
            onBlur={handleFilterChange}
            className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">All Types</option>
            {EVENT_TYPES.filter(type => type !== 'All').map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Date Filter Input */}
        <div className="w-full md:w-auto">
          <label htmlFor="date-filter" className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            id="date-filter"
            type="date"
            value={filterStartDate}
            onChange={(e) => {
              setFilterStartDate(e.target.value);
              // Don't call handleFilterChange here to avoid double-fetch
            }}
            onBlur={handleFilterChange}
            className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>

        {/* Apply Button */}
        <div className="flex items-end">
          <button
            onClick={handleFilterChange}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin w-8 h-8 border-t-4 border-blue-500 border-solid rounded-full" role="status">
            <span className="sr-only">Loading events...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="text-red-600 p-4 border border-red-200 rounded bg-red-50 mb-4">
          <p className="font-medium">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {/* Events Table */}
      {!loading && !error && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Type</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Block #</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Timestamp</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Tx Hash</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Label</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Parent Hash</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 px-6 text-center text-gray-500">
                      No events found matching the current filters.
                    </td>
                  </tr>
                ) : (
                  events.map((event, index) => (
                    <tr 
                      key={`${event.transactionHash}_${event.logIndex}`}
                      className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    >
                      <td className="py-3 px-4 border-b">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                          {event.eventType}
                        </span>
                      </td>
                      <td className="py-3 px-4 border-b">
                        {event.blockNumber.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 border-b">
                        {formatTimestamp(event.timestamp)}
                      </td>
                      <td className="py-3 px-4 border-b">
                        <a 
                          href={`https://basescan.org/tx/${event.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {shortenHash(event.transactionHash)}
                        </a>
                      </td>
                      <td className="py-3 px-4 border-b">
                        {'label' in event ? event.label : ''}
                      </td>
                      <td className="py-3 px-4 border-b">
                        {'parenthash' in event ? shortenHash(event.parenthash) : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalEvents > 0 && (
            <div className="mt-6 flex justify-between items-center">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              
              <div className="text-sm text-gray-600">
                Page {currentPage} of {totalPages || 1} ({totalEvents.toLocaleString()} total events)
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Events page component wrapped in Suspense for searchParams access
 */
export default function EventsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
      <EventsContent />
    </Suspense>
  );
}