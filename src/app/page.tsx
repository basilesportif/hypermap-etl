"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DEFAULT_START_BLOCK } from '../constants';

interface IndexingStatus {
  lastProcessedBlock: number;
  indexingInProgress: boolean;
  startTime: string | null;
  endTime: string | null;
  eventsProcessed: number;
}

export default function Home() {
  const [status, setStatus] = useState<IndexingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [startBlock, setStartBlock] = useState<string>('');
  const [endBlock, setEndBlock] = useState<string>('');
  const [entries, setEntries] = useState<any[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

  // Fetch indexing status
  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/indexer/status');
      const data = await response.json();
      
      if (data.success && data.status) {
        setStatus(data.status);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching status:', error);
      setLoading(false);
    }
  };

  // Start indexing
  const handleStartIndexing = async () => {
    try {
      setLoading(true);
      
      const payload: Record<string, string> = {};
      if (startBlock) payload.fromBlock = startBlock;
      if (endBlock) payload.toBlock = endBlock;
      
      const response = await fetch('/api/indexer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Reset form fields
        setStartBlock('');
        setEndBlock('');
        
        // Fetch updated status
        await fetchStatus();
      } else {
        console.error('Error starting indexing:', data.error);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error starting indexing:', error);
      setLoading(false);
    }
  };

  // Fetch entries
  const fetchEntries = async () => {
    try {
      setEntriesLoading(true);
      
      const response = await fetch('/api/entries?limit=10');
      const data = await response.json();
      
      if (data.success && data.data) {
        setEntries(data.data);
      }
      
      setEntriesLoading(false);
    } catch (error) {
      console.error('Error fetching entries:', error);
      setEntriesLoading(false);
    }
  };

  // Load initial status
  useEffect(() => {
    fetchStatus();
    fetchEntries();
    
    // Set up polling for status updates
    const interval = setInterval(fetchStatus, 5000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <h1 className="text-4xl font-bold mb-4">HyperMap ETL</h1>
      <div className="mb-8 text-center">
        <Link href="/dashboard" className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-md font-medium">
          View Status Dashboard
        </Link>
      </div>
      
      <div className="w-full max-w-4xl">
        {/* Indexing Status Section */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-2xl font-semibold mb-4">Indexing Status</h2>
          
          {loading ? (
            <p>Loading status...</p>
          ) : status ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-gray-500 dark:text-gray-400">Last Processed Block</p>
                <p className="text-xl font-medium">{status.lastProcessedBlock.toLocaleString()}</p>
              </div>
              
              <div>
                <p className="text-gray-500 dark:text-gray-400">Status</p>
                <p className={`text-xl font-medium ${status.indexingInProgress ? 'text-yellow-500' : 'text-green-500'}`}>
                  {status.indexingInProgress ? 'Indexing in Progress' : 'Idle'}
                </p>
              </div>
              
              <div>
                <p className="text-gray-500 dark:text-gray-400">Events Processed</p>
                <p className="text-xl font-medium">{status.eventsProcessed.toLocaleString()}</p>
              </div>
              
              <div>
                <p className="text-gray-500 dark:text-gray-400">Last Run</p>
                <p className="text-xl font-medium">
                  {status.startTime && new Date(status.startTime).toLocaleString()}
                </p>
              </div>
              
            </div>
          ) : (
            <p>No status available. Please start indexing.</p>
          )}
        </section>
        
        {/* Indexing Control Section */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-2xl font-semibold mb-4">Start Indexing</h2>
          
          <form onSubmit={(e) => { e.preventDefault(); handleStartIndexing(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="startBlock" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Block (default: {DEFAULT_START_BLOCK})
                </label>
                <input
                  type="number"
                  id="startBlock"
                  value={startBlock}
                  onChange={(e) => setStartBlock(e.target.value)}
                  placeholder={DEFAULT_START_BLOCK.toString()}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700"
                />
              </div>
              
              <div>
                <label htmlFor="endBlock" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Block (default: latest)
                </label>
                <input
                  type="number"
                  id="endBlock"
                  value={endBlock}
                  onChange={(e) => setEndBlock(e.target.value)}
                  placeholder="latest"
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700"
                />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading || (status?.indexingInProgress ?? false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Start Indexing'}
            </button>
            
            {status?.indexingInProgress && (
              <p className="text-yellow-500 text-center">
                Indexing is already in progress. Please wait for it to complete.
              </p>
            )}
          </form>
        </section>
        
        {/* Entries Preview Section */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Recent Entries</h2>
            <button
              onClick={fetchEntries}
              disabled={entriesLoading}
              className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 px-3 py-1 rounded-md"
            >
              Refresh
            </button>
          </div>
          
          {entriesLoading ? (
            <p>Loading entries...</p>
          ) : entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Label</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Namehash</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Parent</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Block</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {entries.map((entry) => (
                    <tr key={entry.namehash}>
                      <td className="px-4 py-2 whitespace-nowrap">{entry.label}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs">{entry.namehash}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs">{entry.parentHash}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{entry.creationBlock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-4">No entries found. Start indexing to populate the database.</p>
          )}
          
          <div className="mt-4 text-center">
            <Link href="/explorer" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
              Open Full Explorer →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}