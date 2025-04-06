'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getStatus, extractEvents } from './actions';

interface StatusData {
  events: {
    total: number;
    byType: {
      type: string;
      count: number;
      percentage: number;
    }[];
  };
  processing: {
    lastBlock: number;
    lastBlockTime: string;
    hoursAgo: number;
  };
}

interface ExtractionStatus {
  status: 'idle' | 'running' | 'completed' | 'error';
  message: string;
  progress: {
    fromBlock: number;
    toBlock: number;
    currentBlock: number;
    completion: number;
  } | null;
  events: {
    total: number;
    newInChunk: number;
    byType: {
      type: string;
      count: number;
      percentage: number;
    }[];
  } | null;
  error?: string;
  logs: string[];
}

export default function Home() {
  // Status data state
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  
  // Extraction state
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus>({
    status: 'idle',
    message: 'Ready to extract events',
    progress: null,
    events: null,
    logs: []
  });
  
  // Block range inputs
  const [startBlock, setStartBlock] = useState<string>('');
  const [endBlock, setEndBlock] = useState<string>('');
  
  // Fetch status data
  const fetchStatusData = useCallback(async () => {
    try {
      setStatusLoading(true);
      const data = await getStatus();
      setStatusData(data);
      setStatusError(null);
      
      // Set default start block to last processed block + 1
      if (data && data.processing.lastBlock > 0 && startBlock === '') {
        setStartBlock((data.processing.lastBlock + 1).toString());
      }
    } catch (error) {
      console.error('Error fetching status:', error);
      setStatusError('Failed to load status data');
    } finally {
      setStatusLoading(false);
    }
  }, [startBlock]);
  
  // Load initial status
  useEffect(() => {
    fetchStatusData();
    
    // Refresh status periodically
    const interval = setInterval(fetchStatusData, 30000);
    return () => clearInterval(interval);
  }, [fetchStatusData]);
  
  // Add log message
  const addLog = (message: string) => {
    setExtractionStatus(prev => ({
      ...prev,
      logs: [...prev.logs, `[${new Date().toISOString().substr(11, 8)}] ${message}`]
    }));
  };
  
  // Start event extraction
  const startExtraction = async () => {
    // Validate inputs
    if (!startBlock) {
      addLog('Error: Start block is required');
      return;
    }
    
    const fromBlock = parseInt(startBlock);
    const toBlock = endBlock ? parseInt(endBlock) : 'latest';
    
    setExtractionStatus({
      status: 'running',
      message: `Starting extraction from block ${fromBlock}...`,
      progress: {
        fromBlock,
        toBlock: typeof toBlock === 'number' ? toBlock : 0,
        currentBlock: fromBlock,
        completion: 0
      },
      events: null,
      logs: [`[${new Date().toISOString().substr(11, 8)}] Starting extraction from block ${fromBlock}...`]
    });
    
    try {
      await runExtraction(fromBlock, toBlock);
    } catch (error) {
      console.error('Extraction error:', error);
      addLog(`Error during extraction: ${error}`);
      setExtractionStatus(prev => ({
        ...prev,
        status: 'error',
        message: `Error during extraction: ${error}`
      }));
    }
  };
  
  // Run extraction recursively for each chunk
  const runExtraction = async (
    currentStartBlock: number, 
    endBlock: number | 'latest'
  ) => {
    try {
      addLog(`Processing blocks ${currentStartBlock} to ${typeof endBlock === 'number' ? endBlock : 'latest'}...`);
      
      // Extract events for current chunk
      const result = await extractEvents(currentStartBlock, endBlock);
      
      // Update extraction status
      setExtractionStatus(prev => ({
        ...prev,
        status: result.status === 'error' ? 'error' : result.status === 'completed' ? 'completed' : 'running',
        message: result.message,
        progress: result.progress,
        events: result.events,
        error: result.error
      }));
      
      // Log the results
      addLog(result.message);
      if (result.events.newInChunk > 0) {
        addLog(`Found ${result.events.newInChunk} new events`);
      }
      
      // If there's a next chunk to process, continue
      if (result.nextStartBlock) {
        // Refresh status data before continuing
        await fetchStatusData();
        
        // Continue with next chunk
        addLog(`Continuing with next chunk from block ${result.nextStartBlock}...`);
        await runExtraction(result.nextStartBlock, endBlock);
      } else {
        // Extraction completed
        addLog('Extraction completed!');
        
        // Final status refresh
        await fetchStatusData();
      }
    } catch (error) {
      console.error('Chunk extraction error:', error);
      addLog(`Error processing chunk: ${error}`);
      throw error;
    }
  };
  
  return (
    <main className="min-h-screen p-6 bg-gray-50">
      <div className="w-full mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">HyperMap ETL Dashboard</h1>
        
        {/* Fixed three-column layout by default */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8 min-h-[400px]">
          {/* Database Status Card */}
          <div className="bg-white p-6 rounded-lg shadow-md flex-1">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Database Status</h2>
            
            {statusLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin w-8 h-8 border-t-4 border-blue-500 border-solid rounded-full"></div>
              </div>
            ) : statusError ? (
              <div className="text-red-500 p-4 border border-red-200 rounded bg-red-50">
                {statusError}
                <button 
                  onClick={fetchStatusData}
                  className="block mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Retry
                </button>
              </div>
            ) : statusData ? (
              <div>
                <div className="mb-6">
                  <p className="text-gray-600 text-sm">Total Events</p>
                  <p className="text-3xl font-bold text-blue-600">{statusData.events.total.toLocaleString()}</p>
                </div>
                
                <div>
                  <p className="text-gray-600 text-sm">Last Block Processed</p>
                  <p className="text-2xl font-semibold">{statusData.processing.lastBlock.toLocaleString()}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(statusData.processing.lastBlockTime).toLocaleString()} 
                    {' '}
                    ({statusData.processing.hoursAgo > 0 
                      ? `${statusData.processing.hoursAgo} hours ago` 
                      : 'Less than an hour ago'})
                  </p>
                </div>
              </div>
            ) : (
              <p>No data available</p>
            )}
          </div>
          
          {/* Events by Type Card */}
          <div className="bg-white p-6 rounded-lg shadow-md flex-1">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Events by Type</h2>
            
            {statusLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin w-8 h-8 border-t-4 border-blue-500 border-solid rounded-full"></div>
              </div>
            ) : statusError ? (
              <div className="text-red-500 p-4 border border-red-200 rounded bg-red-50">
                {statusError}
              </div>
            ) : statusData && statusData.events.byType.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-3 text-left">Type</th>
                      <th className="py-2 px-3 text-right">Count</th>
                      <th className="py-2 px-3 text-right">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusData.events.byType.map((event, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="py-1.5 px-3">{event.type}</td>
                        <td className="py-1.5 px-3 text-right">{event.count.toLocaleString()}</td>
                        <td className="py-1.5 px-3 text-right">{event.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No event data available</p>
            )}
          </div>
          
          {/* Extract Events Card */}
          <div className="bg-white p-6 rounded-lg shadow-md flex-1">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Extract Events</h2>
            
            <form 
              onSubmit={(e) => { e.preventDefault(); startExtraction(); }} 
              className="mb-4"
            >
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Block
                  </label>
                  <input
                    type="number"
                    value={startBlock}
                    onChange={(e) => setStartBlock(e.target.value)}
                    placeholder="Enter start block"
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Block (optional)
                  </label>
                  <input
                    type="number"
                    value={endBlock}
                    onChange={(e) => setEndBlock(e.target.value)}
                    placeholder="latest"
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              </div>
              
              <button
                type="submit"
                disabled={extractionStatus.status === 'running'}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
              >
                {extractionStatus.status === 'running' ? 'Extraction Running...' : 'Extract Events'}
              </button>
            </form>
            
            {/* Progress indicators (only show when extraction is active) */}
            {extractionStatus.status !== 'idle' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">
                    Status: <span className={
                      extractionStatus.status === 'running' ? 'text-blue-500' :
                      extractionStatus.status === 'completed' ? 'text-green-500' :
                      extractionStatus.status === 'error' ? 'text-red-500' : ''
                    }>
                      {extractionStatus.status.charAt(0).toUpperCase() + extractionStatus.status.slice(1)}
                    </span>
                  </p>
                  
                  {extractionStatus.progress && (
                    <p className="text-sm text-gray-500">
                      {extractionStatus.progress.completion}% Complete
                    </p>
                  )}
                </div>
                
                {extractionStatus.progress && (
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${Math.min(100, extractionStatus.progress.completion)}%` }}
                    ></div>
                  </div>
                )}
                
                {/* Event Stats for Current Chunk */}
                {extractionStatus.events && extractionStatus.events.total > 0 && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-md">
                    <p className="font-medium">Events in current chunk: {extractionStatus.events.total}</p>
                    <p className="text-sm text-green-600">New events: {extractionStatus.events.newInChunk}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Log Messages - Always shown as full width below the cards */}
        {extractionStatus.status !== 'idle' && (
          <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <p className="font-medium mb-2">Extraction Log:</p>
            <div className="bg-gray-800 text-gray-100 p-3 rounded-md text-xs font-mono h-48 overflow-y-auto">
              {extractionStatus.logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}