'use client';

import { useState, useEffect, useCallback, Suspense, Fragment } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getEvents } from './actions';
import { HypermapEvent, GetEventsParams } from '../../types';
import Link from 'next/link';
import { ethers } from 'ethers';

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
function shortenHash(hash: string | number | bigint): string {
  if (!hash) return '';
  const hashStr = String(hash);
  return `${hashStr.substring(0, 6)}...${hashStr.substring(hashStr.length - 4)}`;
}

/**
 * Main Events page content component
 */
// Simple chevron icons as components
const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
  </svg>
);

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
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  
  /**
   * Helper function for decoding event data based on label
   */
  function decodeEventData(label: string, data: string, truncate: boolean = false): string | number | JSX.Element {
    if (!data || data === '0x' || data === '') return <span className="text-gray-400">N/A</span>;

    try {
      if (label === '~ip' || label === '~port' || label === '~tcp-port' || label === '~ws-port') {
        const value = ethers.toBigInt(data);
        if (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) {
          return Number(value);
        } else {
          return value.toString();
        }
      } else if (label === '~net-key' || label === '~routers') {
        return <code title={String(data)}>{shortenHash(data)}</code>;
      } else {
        const decoded = ethers.toUtf8String(data);
        if (truncate && decoded.length > 100) {
          return <span title={decoded}>{decoded.substring(0, 100)}...</span>;
        }
        return decoded;
      }
    } catch (e) {
      console.error(`Error decoding data for label "${label}" (data: ${data}):`, e);
      if (truncate) {
        return <span className="text-red-500" title={`Error decoding raw data: ${data}`}>Invalid...</span>;
      }
      return <span className="text-red-500" title={`Error decoding raw data: ${data}`}>Invalid Data ({shortenHash(data)})</span>;
    }
  }

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
  
  // Toggle function for expanding/collapsing rows
  const toggleRow = (eventId: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [eventId]: !prev[eventId]
    }));
  };

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
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Label</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Data</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Block</th>
                  <th className="py-3 px-4 text-center text-sm font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 px-6 text-center text-gray-500">
                      No events found matching the current filters.
                    </td>
                  </tr>
                ) : (
                  events.map((event, index) => {
                    const eventId = `${event.transactionHash}_${event.logIndex}`;
                    const isExpanded = expandedRows[eventId] || false;
                    
                    return (
                      <Fragment key={eventId}>
                        {/* Main Row */}
                        <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="py-3 px-4 border-b">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                              {event.eventType}
                            </span>
                          </td>
                          <td className="py-3 px-4 border-b truncate max-w-lg">
                            {event.label 
                              ? event.label.length > 100 
                                ? <span title={event.label}>{event.label.substring(0, 100)}...</span> 
                                : event.label
                              : <span className="text-gray-400">N/A</span>
                            }
                          </td>
                          <td className="py-3 px-4 border-b truncate max-w-lg">
                            {(event.eventType === 'Fact' || event.eventType === 'Note') 
                              ? decodeEventData(event.label, event.data, true) // Truncate in the main row
                              : <span className="text-gray-400">N/A</span>
                            }
                          </td>
                          <td className="py-3 px-4 border-b">
                            {event.blockNumber.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 border-b text-center">
                            <button 
                              onClick={() => toggleRow(eventId)} 
                              className="p-1 rounded hover:bg-gray-200"
                              aria-label={isExpanded ? "Collapse details" : "Expand details"}
                            >
                              {isExpanded 
                                ? <ChevronUpIcon /> 
                                : <ChevronDownIcon />
                              }
                            </button>
                          </td>
                        </tr>
                        
                        {/* Details Row (Conditional) */}
                        {isExpanded && (
                          <tr className="bg-gray-100">
                            <td colSpan={5} className="py-3 px-6 border-b text-xs">
                              <div className="space-y-1">
                                <div><strong>Timestamp:</strong> {formatTimestamp(event.timestamp)}</div>
                                <div>
                                  <strong>Tx Hash:</strong>{' '}
                                  <a 
                                    href={`https://basescan.org/tx/${event.transactionHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                  >
                                    <code title={String(event.transactionHash)}>{shortenHash(event.transactionHash)}</code>
                                  </a>
                                </div>
                                
                                {/* Event-specific details */}
                                {event.eventType === 'Mint' && (
                                  <>
                                    <div><strong>Parent:</strong> <code title={String(event.parenthash)}>{shortenHash(event.parenthash)}</code></div>
                                    <div><strong>Child:</strong> <code title={String(event.childhash)}>{shortenHash(event.childhash)}</code></div>
                                    <div><strong>LabelHash:</strong> <code title={String(event.labelhash)}>{shortenHash(event.labelhash)}</code></div>
                                  </>
                                )}
                                {event.eventType === 'Fact' && (
                                  <>
                                    <div><strong>Parent:</strong> <code title={String(event.parenthash)}>{shortenHash(event.parenthash)}</code></div>
                                    <div><strong>FactHash:</strong> <code title={String(event.facthash)}>{shortenHash(event.facthash)}</code></div>
                                    <div><strong>LabelHash:</strong> <code title={String(event.labelhash)}>{shortenHash(event.labelhash)}</code></div>
                                    <div><strong>Data:</strong> {decodeEventData(event.label, event.data)}</div>
                                  </>
                                )}
                                {event.eventType === 'Note' && (
                                  <>
                                    <div><strong>Parent:</strong> <code title={String(event.parenthash)}>{shortenHash(event.parenthash)}</code></div>
                                    <div><strong>NoteHash:</strong> <code title={String(event.notehash)}>{shortenHash(event.notehash)}</code></div>
                                    <div><strong>LabelHash:</strong> <code title={String(event.labelhash)}>{shortenHash(event.labelhash)}</code></div>
                                    <div><strong>Data:</strong> {decodeEventData(event.label, event.data)}</div>
                                  </>
                                )}
                                {event.eventType === 'Gene' && (
                                  <>
                                    <div><strong>Entry:</strong> <code title={String(event.entry)}>{shortenHash(event.entry)}</code></div>
                                    <div><strong>Gene Addr:</strong> <code title={String(event.gene)}>{shortenHash(event.gene)}</code></div>
                                  </>
                                )}
                                {event.eventType === 'Transfer' && (
                                  <>
                                    <div><strong>From:</strong> <code title={String(event.from)}>{shortenHash(event.from)}</code></div>
                                    <div><strong>To:</strong> <code title={String(event.to)}>{shortenHash(event.to)}</code></div>
                                    <div><strong>ID:</strong> <code title={String(event.id)}>{String(event.id).length > 12 ? shortenHash(event.id) : String(event.id)}</code></div>
                                  </>
                                )}
                                {event.eventType === 'Zero' && (
                                  <div><strong>Zero TBA:</strong> <code title={String(event.zeroTba)}>{shortenHash(event.zeroTba)}</code></div>
                                )}
                                {event.eventType === 'Upgraded' && (
                                  <div><strong>New Impl:</strong> <code title={String(event.implementation)}>{shortenHash(event.implementation)}</code></div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
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