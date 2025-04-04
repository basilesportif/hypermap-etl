"use client";

import { useState, useEffect } from 'react';
import { ROOT_HASH, DEFAULT_START_BLOCK } from '../../constants';

interface HypermapEntry {
  namehash: string;
  label: string;
  parentHash: string;
  fullName?: string;
  owner?: string;
  gene?: string;
  notes: Record<string, any>;
  facts: Record<string, any>;
  children: string[];
  creationBlock: number;
  lastUpdateBlock: number;
}

interface BaseHypermapEvent {
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  timestamp?: number;
  eventType: string;
}

interface MintEvent extends BaseHypermapEvent {
  eventType: 'Mint';
  parenthash: string;
  childhash: string;
  labelhash: string;
  label: string;
}

interface FactEvent extends BaseHypermapEvent {
  eventType: 'Fact';
  parenthash: string;
  facthash: string;
  labelhash: string;
  label: string;
  data: string;
}

interface NoteEvent extends BaseHypermapEvent {
  eventType: 'Note';
  parenthash: string;
  notehash: string;
  labelhash: string;
  label: string;
  data: string;
}

interface GeneEvent extends BaseHypermapEvent {
  eventType: 'Gene';
  entry: string;
  gene: string;
}

interface TransferEvent extends BaseHypermapEvent {
  eventType: 'Transfer';
  from: string;
  to: string;
  id: string;
}

type HypermapEvent = MintEvent | FactEvent | NoteEvent | GeneEvent | TransferEvent;

export default function Explorer() {
  const [loading, setLoading] = useState(true);
  const [currentHash, setCurrentHash] = useState(ROOT_HASH);
  const [currentEntry, setCurrentEntry] = useState<HypermapEntry | null>(null);
  const [children, setChildren] = useState<HypermapEntry[]>([]);
  const [path, setPath] = useState<{hash: string, label: string}[]>([{ hash: ROOT_HASH, label: 'root' }]);
  const [activeTab, setActiveTab] = useState<'details' | 'events' | 'debug'>('details');
  const [events, setEvents] = useState<HypermapEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsPagination, setEventsPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<any>(null);
  const [indexFromBlock, setIndexFromBlock] = useState<string>(DEFAULT_START_BLOCK.toString());
  const [indexToBlock, setIndexToBlock] = useState<string>((DEFAULT_START_BLOCK + 1000).toString());
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexMessage, setIndexMessage] = useState<string>('');
  
  // Fetch current entry and its children
  const fetchEntry = async (hash: string) => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/entries/${hash}?includeChildren=true`);
      const data = await response.json();
      
      if (data.success) {
        setCurrentEntry(data.data);
        setChildren(data.children || []);
      } else {
        console.error('Error fetching entry:', data.error);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching entry:', error);
      setLoading(false);
    }
  };
  
  // Handle navigation to a child
  const navigateToChild = (entry: HypermapEntry) => {
    setCurrentHash(entry.namehash);
    setPath([...path, { hash: entry.namehash, label: entry.label }]);
  };
  
  // Handle navigation to a parent
  const navigateToParent = (hash: string, index: number) => {
    setCurrentHash(hash);
    setPath(path.slice(0, index + 1));
  };
  
  // Fetch events for the current entry
  const fetchEvents = async (page = 1, eventType: string | null = null) => {
    if (!currentHash) return;
    
    try {
      setEventsLoading(true);
      
      let url = `/api/entries/${currentHash}/events?page=${page}&limit=${eventsPagination.limit}`;
      if (eventType) {
        url += `&eventType=${eventType}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setEvents(data.data);
        setEventsPagination({
          ...eventsPagination,
          page: data.pagination.page,
          total: data.pagination.total,
          totalPages: data.pagination.totalPages
        });
      } else {
        console.error('Error fetching events:', data.error);
      }
      
      setEventsLoading(false);
    } catch (error) {
      console.error('Error fetching events:', error);
      setEventsLoading(false);
    }
  };
  
  // Handle page change for events
  const handleEventPageChange = (newPage: number) => {
    fetchEvents(newPage, selectedEventType);
  };
  
  // Handle event type filter change
  const handleEventTypeChange = (eventType: string | null) => {
    setSelectedEventType(eventType);
    fetchEvents(1, eventType);
  };
  
  // Load initial entry
  useEffect(() => {
    fetchEntry(currentHash);
  }, [currentHash]);
  
  // Fetch indexer status and database info
  const fetchIndexStatus = async () => {
    try {
      const [statusResponse, collectionsResponse] = await Promise.all([
        fetch('/api/indexer/status'),
        fetch('/api/diagnostic/collections')
      ]);
      
      const statusData = await statusResponse.json();
      const collectionsData = await collectionsResponse.json();
      
      if (statusData.success) {
        setIndexStatus({
          ...statusData.status,
          collections: collectionsData.success ? collectionsData.mongodb : null
        });
      }
    } catch (error) {
      console.error('Error fetching indexer status:', error);
    }
  };
  
  // Start blockchain indexing
  const startIndexing = async () => {
    setIsIndexing(true);
    setIndexMessage('Starting indexing...');
    
    try {
      const response = await fetch('/api/indexer/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fromBlock: parseInt(indexFromBlock),
          toBlock: indexToBlock.toLowerCase() === 'latest' ? 'latest' : parseInt(indexToBlock)
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIndexMessage(`Indexing completed successfully!`);
        fetchIndexStatus();
      } else {
        setIndexMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      setIndexMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsIndexing(false);
    }
  };
  
  // Load events when tab changes to events
  useEffect(() => {
    if (activeTab === 'events' && currentHash) {
      fetchEvents(1, selectedEventType);
    }
    
    if (activeTab === 'debug') {
      fetchIndexStatus();
    }
  }, [activeTab, currentHash]);
  
  // Format property for display
  const formatProperty = (value: any): string => {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };
  
  // Format timestamp to readable date
  const formatTimestamp = (timestamp?: number): string => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp * 1000).toLocaleString();
  };
  
  // Render event details based on type
  const renderEventDetails = (event: HypermapEvent) => {
    switch (event.eventType) {
      case 'Mint':
        return (
          <>
            <p><strong>Parent:</strong> {event.parenthash}</p>
            <p><strong>Child:</strong> {event.childhash}</p>
            <p><strong>Label:</strong> {event.label}</p>
          </>
        );
      case 'Fact':
        return (
          <>
            <p><strong>Parent:</strong> {event.parenthash}</p>
            <p><strong>Label:</strong> {event.label}</p>
            <p><strong>Data:</strong> {event.data}</p>
          </>
        );
      case 'Note':
        return (
          <>
            <p><strong>Parent:</strong> {event.parenthash}</p>
            <p><strong>Label:</strong> {event.label}</p>
            <p><strong>Data:</strong> {event.data}</p>
          </>
        );
      case 'Gene':
        return (
          <>
            <p><strong>Entry:</strong> {event.entry}</p>
            <p><strong>Gene:</strong> {event.gene}</p>
          </>
        );
      case 'Transfer':
        return (
          <>
            <p><strong>From:</strong> {event.from}</p>
            <p><strong>To:</strong> {event.to}</p>
            <p><strong>ID:</strong> {event.id}</p>
          </>
        );
      default:
        return <p>Unknown event type</p>;
    }
  };

  return (
    <main className="flex min-h-screen flex-col p-8">
      <h1 className="text-4xl font-bold mb-8">HyperMap Explorer</h1>
      
      {/* Breadcrumb Navigation */}
      <nav className="mb-6">
        <ol className="flex flex-wrap">
          {path.map((item, index) => (
            <li key={item.hash} className="flex items-center">
              {index > 0 && <span className="mx-2 text-gray-500">/</span>}
              <button
                onClick={() => navigateToParent(item.hash, index)}
                className="hover:text-blue-600 dark:hover:text-blue-400"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      
      {/* Tab Navigation */}
      <div className="flex mb-6 border-b dark:border-gray-700">
        <button
          onClick={() => setActiveTab('details')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'details'
              ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'events'
              ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Events
        </button>
        <button
          onClick={() => setActiveTab('debug')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'debug'
              ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Indexer
        </button>
      </div>
      
      {activeTab === 'details' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Current Entry Details */}
          <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md lg:col-span-1">
            <h2 className="text-2xl font-semibold mb-4">Entry Details</h2>
            
            {loading ? (
              <p>Loading entry...</p>
            ) : currentEntry ? (
              <div className="space-y-4">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Label</p>
                  <p className="font-medium">{currentEntry.label}</p>
                </div>
                
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Namehash</p>
                  <p className="font-mono text-xs break-all">{currentEntry.namehash}</p>
                </div>
                
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Full Name</p>
                  <p className="font-medium">{currentEntry.fullName || ''}</p>
                </div>
                
                {currentEntry.owner && (
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Owner</p>
                    <p className="font-mono text-xs break-all">{currentEntry.owner}</p>
                  </div>
                )}
                
                {currentEntry.gene && (
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Gene</p>
                    <p className="font-mono text-xs break-all">{currentEntry.gene}</p>
                  </div>
                )}
                
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Creation Block</p>
                  <p className="font-medium">{currentEntry.creationBlock}</p>
                </div>
                
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Last Update Block</p>
                  <p className="font-medium">{currentEntry.lastUpdateBlock}</p>
                </div>
              </div>
            ) : (
              <p>Entry not found</p>
            )}
          </section>
          
          {/* Facts and Notes */}
          <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md lg:col-span-2">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold mb-4">Facts</h2>
              
              {loading ? (
                <p>Loading facts...</p>
              ) : currentEntry && Object.keys(currentEntry.facts).length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {Object.entries(currentEntry.facts).map(([key, value]) => (
                    <div key={`fact-${key}`} className="border dark:border-gray-700 p-4 rounded-md">
                      <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">{key}</p>
                      <p className="font-mono text-xs break-all">{formatProperty(value)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No facts available</p>
              )}
            </div>
            
            <div>
              <h2 className="text-2xl font-semibold mb-4">Notes</h2>
              
              {loading ? (
                <p>Loading notes...</p>
              ) : currentEntry && Object.keys(currentEntry.notes).length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {Object.entries(currentEntry.notes).map(([key, value]) => (
                    <div key={`note-${key}`} className="border dark:border-gray-700 p-4 rounded-md">
                      <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">{key}</p>
                      <p className="font-mono text-xs break-all">{formatProperty(value)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No notes available</p>
              )}
            </div>
          </section>
          
          {/* Children */}
          <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md lg:col-span-3">
            <h2 className="text-2xl font-semibold mb-4">Children</h2>
            
            {loading ? (
              <p>Loading children...</p>
            ) : children.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {children.map((child) => (
                  <button
                    key={child.namehash}
                    onClick={() => navigateToChild(child)}
                    className="text-left border dark:border-gray-700 p-4 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <p className="font-medium mb-1">{child.label}</p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">
                      {child.children.length} children • {Object.keys(child.facts).length} facts • {Object.keys(child.notes).length} notes
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No children available</p>
            )}
          </section>
        </div>
      ) : (
        /* Events Tab */
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Event Timeline</h2>
            
            <div className="flex items-center space-x-2">
              <select
                className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1 text-sm"
                value={selectedEventType || ''}
                onChange={(e) => handleEventTypeChange(e.target.value === '' ? null : e.target.value)}
              >
                <option value="">All Events</option>
                <option value="Mint">Mint</option>
                <option value="Fact">Fact</option>
                <option value="Note">Note</option>
                <option value="Gene">Gene</option>
                <option value="Transfer">Transfer</option>
              </select>
            </div>
          </div>
          
          {eventsLoading ? (
            <p>Loading events...</p>
          ) : events.length > 0 ? (
            <>
              <div className="space-y-6">
                {events.map((event, index) => (
                  <div key={`${event.blockNumber}-${event.logIndex}`} className="border dark:border-gray-700 p-4 rounded-md">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mb-2 ${
                          event.eventType === 'Mint' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
                          event.eventType === 'Fact' ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100' :
                          event.eventType === 'Note' ? 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100' :
                          event.eventType === 'Gene' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100' :
                          'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                        }`}>
                          {event.eventType}
                        </span>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{formatTimestamp(event.timestamp)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Block: {event.blockNumber}</p>
                        <a 
                          href={`https://basescan.org/tx/${event.transactionHash}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          View on BaseScan
                        </a>
                      </div>
                    </div>
                    
                    <div className="mt-2 text-sm">
                      {renderEventDetails(event as HypermapEvent)}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Pagination */}
              {eventsPagination.totalPages > 1 && (
                <div className="flex justify-center mt-6">
                  <nav className="flex space-x-1">
                    <button
                      onClick={() => handleEventPageChange(Math.max(1, eventsPagination.page - 1))}
                      disabled={eventsPagination.page === 1}
                      className={`px-3 py-1 rounded-md ${
                        eventsPagination.page === 1
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      Previous
                    </button>
                    
                    {[...Array(eventsPagination.totalPages)].map((_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => handleEventPageChange(i + 1)}
                        className={`px-3 py-1 rounded-md ${
                          eventsPagination.page === i + 1
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    
                    <button
                      onClick={() => handleEventPageChange(Math.min(eventsPagination.totalPages, eventsPagination.page + 1))}
                      disabled={eventsPagination.page === eventsPagination.totalPages}
                      className={`px-3 py-1 rounded-md ${
                        eventsPagination.page === eventsPagination.totalPages
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      Next
                    </button>
                  </nav>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500">No events found for this entry</p>
          )}
        </section>
      ) : activeTab === 'debug' ? (
        /* Indexer Debug Tab */
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-6">Blockchain Indexer</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <h3 className="text-lg font-medium mb-4">Indexer Status</h3>
              
              {indexStatus ? (
                <div className="space-y-2">
                  <p>
                    <span className="font-semibold">Last Block:</span> {indexStatus.lastProcessedBlock}
                  </p>
                  <p>
                    <span className="font-semibold">Indexing Active:</span> {indexStatus.indexingInProgress ? 'Yes' : 'No'}
                  </p>
                  {indexStatus.startTime && (
                    <p>
                      <span className="font-semibold">Start Time:</span> {new Date(indexStatus.startTime).toLocaleString()}
                    </p>
                  )}
                  {indexStatus.endTime && (
                    <p>
                      <span className="font-semibold">End Time:</span> {new Date(indexStatus.endTime).toLocaleString()}
                    </p>
                  )}
                  <p>
                    <span className="font-semibold">Events Processed:</span> {indexStatus.eventsProcessed}
                  </p>
                  
                  {indexStatus.collections && (
                    <div className="mt-4 pt-4 border-t dark:border-gray-700">
                      <h4 className="font-medium mb-2">Database Collections</h4>
                      {indexStatus.collections.collections.length > 0 ? (
                        <ul className="text-sm space-y-1">
                          {indexStatus.collections.collections.map((col: any) => (
                            <li key={col.name}>
                              {col.name}: <span className="font-mono">{col.count}</span> documents
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500">No collections found</p>
                      )}
                      
                      {Object.keys(indexStatus.collections.eventTypes).length > 0 && (
                        <div className="mt-2">
                          <h4 className="font-medium mb-1">Event Types</h4>
                          <ul className="text-sm space-y-1">
                            {Object.entries(indexStatus.collections.eventTypes).map(([type, count]: [string, any]) => (
                              <li key={type}>
                                {type}: <span className="font-mono">{count}</span> events
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p>Loading status...</p>
              )}
              
              <button
                onClick={fetchIndexStatus}
                className="mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                Refresh Status
              </button>
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-4">Start Indexing</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">From Block</label>
                  <input
                    type="text"
                    value={indexFromBlock}
                    onChange={(e) => setIndexFromBlock(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                    disabled={isIndexing}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">To Block</label>
                  <input
                    type="text"
                    value={indexToBlock}
                    onChange={(e) => setIndexToBlock(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                    disabled={isIndexing}
                    placeholder="Number or 'latest'"
                  />
                  <p className="text-xs text-gray-500 mt-1">Enter a block number or "latest"</p>
                </div>
                
                <button
                  onClick={startIndexing}
                  disabled={isIndexing}
                  className={`w-full px-4 py-2 rounded-md ${
                    isIndexing
                      ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isIndexing ? 'Indexing...' : 'Start Indexing'}
                </button>
                
                {indexMessage && (
                  <div className={`p-3 rounded-md ${
                    indexMessage.includes('Error')
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  }`}>
                    {indexMessage}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium mb-4">Blockchain Data Info</h3>
            <p className="mb-2"><strong>Contract Address:</strong> 0x000000000044C6B8Cb4d8f0F889a3E47664EAeda</p>
            <p className="mb-2"><strong>Start Block:</strong> {DEFAULT_START_BLOCK}</p>
            <p className="mb-4"><strong>Network:</strong> Base Mainnet</p>
            
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-md">
              <p className="text-sm">
                <strong>Note:</strong> Indexing can take a long time for large block ranges. Start with a small range (like 1,000 blocks) to test.
                Make sure your environment has a valid Base RPC URL set in the .env file.
              </p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}