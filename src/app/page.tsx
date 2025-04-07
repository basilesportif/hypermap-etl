/**
 * @file src/app/page.tsx
 * @description The main dashboard page for the HyperMap ETL application.
 * It displays the overall status of the ETL process, allows users to trigger
 * event extraction for specific block ranges, and shows logs for ongoing extractions.
 *
 * Key features:
 * - Displays total events stored, event breakdown by type, and last processed block.
 * - Shows the latest block number on the connected blockchain (Base).
 * - Provides a form to initiate event extraction (start/end block).
 * - Shows real-time progress and logs during extraction.
 * - Handles loading states and errors gracefully.
 * - Periodically refreshes status data.
 *
 * @dependencies
 * - react: Core React library for component building.
 * - ./actions: Server actions (getStatus, extractEvents).
 *
 * @notes
 * - Uses 'use client' directive for client-side interactivity (state, effects, event handlers).
 * - Employs Tailwind CSS for styling.
 * - Extraction process runs recursively chunk by chunk via the `runExtraction` function.
 * - The top navigation bar is handled by the RootLayout component.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getStatus, extractEvents } from './actions'; // From actions.ts

/**
 * @interface StatusData
 * @description Defines the structure for the overall status data fetched from the server.
 */
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
    latestBlockNumber: number; // Added latest block number from chain
  };
}

/**
 * @interface ExtractionStatus
 * @description Defines the structure for tracking the state of an ongoing event extraction process.
 */
interface ExtractionStatus {
  status: 'idle' | 'running' | 'completed' | 'error';
  message: string;
  progress: {
    fromBlock: number; // Starting block of the overall request
    toBlock: number; // Target end block of the overall request (0 if 'latest')
    currentBlock: number; // Last block processed in the most recent chunk
    completion: number; // Overall percentage completion for the request
  } | null;
  events: { // Stats for the *latest* processed chunk
    total: number;
    newInChunk: number;
    byType: {
      type: string;
      count: number;
      percentage: number;
    }[];
  } | null;
  error?: string; // Error message if status is 'error'
  logs: string[]; // Log messages generated during extraction
}

/**
 * @component Home
 * @description The main functional component for the dashboard page.
 * Manages state for status data, extraction process, and user inputs.
 */
export default function Home() {
  // State for overall database/blockchain status
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  // State for the event extraction process
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus>({
    status: 'idle',
    message: 'Ready to extract events',
    progress: null,
    events: null,
    logs: []
  });

  // State for user input (block range)
  const [startBlock, setStartBlock] = useState<string>('');
  const [endBlock, setEndBlock] = useState<string>(''); // Optional end block

  /**
   * @function fetchStatusData
   * @description Fetches the latest status data from the server action `getStatus`.
   * Updates the `statusData` state and handles loading/error states.
   * Sets the default start block input based on the last processed block.
   * Wrapped in useCallback to prevent unnecessary re-creation.
   */
  const fetchStatusData = useCallback(async () => {
    try {
      setStatusLoading(true);
      const data = await getStatus();
      setStatusData(data);
      setStatusError(null);

      // Set default start block input only if it's currently empty and we have a last processed block
      if (data && data.processing.lastBlock > 0 && startBlock === '') {
        setStartBlock((data.processing.lastBlock + 1).toString());
      }
    } catch (error) {
      console.error('Error fetching status:', error);
      setStatusError('Failed to load status data. Check server logs.'); // More specific error
    } finally {
      setStatusLoading(false);
    }
  }, [startBlock]); // Dependency: startBlock ensures default value is set correctly relative to input state

  /**
   * @effect Initial Load and Periodic Refresh
   * @description Fetches status data on initial component mount and sets up
   * an interval to refresh the data every 30 seconds.
   * Cleans up the interval on component unmount.
   */
  useEffect(() => {
    fetchStatusData(); // Initial fetch

    const interval = setInterval(fetchStatusData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval); // Cleanup on unmount
  }, [fetchStatusData]); // Dependency: fetchStatusData ensures the correct function version is used

  /**
   * @function addLog
   * @description Adds a timestamped message to the extraction logs state.
   * @param {string} message - The log message to add.
   */
  const addLog = (message: string) => {
    setExtractionStatus(prev => ({
      ...prev,
      // Keep only the last 100 logs to prevent excessive memory usage
      logs: [...prev.logs, `[${new Date().toISOString().substring(11, 19)}] ${message}`].slice(-100)
    }));
  };

  /**
   * @function startExtraction
   * @description Validates user input and initiates the event extraction process
   * by calling the `runExtraction` function with the starting block.
   * Resets the extraction status state.
   */
  const startExtraction = async () => {
    // Validate start block input
    if (!startBlock || isNaN(parseInt(startBlock)) || parseInt(startBlock) < 0) {
      addLog('Error: Valid Start block is required');
      setExtractionStatus(prev => ({ ...prev, status: 'error', message: 'Invalid start block.' }));
      return;
    }

    const fromBlock = parseInt(startBlock);
    let toBlock: number | 'latest' = 'latest'; // Default to 'latest'

    // Validate end block input if provided
    if (endBlock) {
      if (isNaN(parseInt(endBlock)) || parseInt(endBlock) < 0) {
        addLog('Error: End block must be a valid number.');
        setExtractionStatus(prev => ({ ...prev, status: 'error', message: 'Invalid end block.' }));
        return;
      }
      const parsedEndBlock = parseInt(endBlock);
      if (parsedEndBlock < fromBlock) {
        addLog('Error: End block cannot be earlier than start block.');
        setExtractionStatus(prev => ({ ...prev, status: 'error', message: 'End block < Start block.' }));
        return;
      }
      toBlock = parsedEndBlock;
    }


    // Reset extraction status and start logging
    setExtractionStatus({
      status: 'running',
      message: `Starting extraction from block ${fromBlock.toLocaleString()}...`,
      progress: {
        fromBlock,
        toBlock: typeof toBlock === 'number' ? toBlock : 0, // Store target block (0 if 'latest')
        currentBlock: fromBlock, // Initially, current block is the start block
        completion: 0
      },
      events: null, // Reset event stats
      logs: [`[${new Date().toISOString().substring(11, 19)}] Starting extraction from block ${fromBlock.toLocaleString()} to ${typeof toBlock === 'number' ? toBlock.toLocaleString() : 'latest'}...`]
    });

    try {
      // Initiate the recursive extraction process
      await runExtraction(fromBlock, toBlock);
    } catch (error) {
      // Catch errors that might bubble up from runExtraction (though it should handle its own errors)
      console.error('Extraction initiation error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`FATAL ERROR during extraction: ${errorMessage}`);
      setExtractionStatus(prev => ({
        ...prev,
        status: 'error',
        message: `Error during extraction: ${errorMessage}`,
        error: errorMessage
      }));
    }
  };

  /**
   * @function runExtraction
   * @description Recursively calls the `extractEvents` server action for chunks
   * of blocks until the target end block is reached or an error occurs.
   * Updates the extraction status state based on the results of each chunk.
   * @param {number} currentStartBlock - The starting block for the current chunk.
   * @param {number | 'latest'} targetEndBlock - The final target end block for the overall extraction request.
   */
  const runExtraction = async (
    currentStartBlock: number,
    targetEndBlock: number | 'latest' // The *original* target end block
  ) => {
    try {
      addLog(`Requesting chunk starting from block ${currentStartBlock.toLocaleString()}...`);

      // Call the server action to extract events for the current chunk/range
      const result = await extractEvents(currentStartBlock, targetEndBlock);

      // Update extraction status based on the result from the server action
      setExtractionStatus(prev => ({
        ...prev,
        // If server reports error, status is error. Otherwise, use server status ('running' or 'completed').
        status: result.status === 'error' ? 'error' : result.status,
        message: result.message, // Message from the server action
        // Update progress details from the server action result
        progress: result.progress ? {
          // Keep the original fromBlock and toBlock from the initial request
          fromBlock: prev.progress?.fromBlock ?? result.progress.fromBlock,
          toBlock: prev.progress?.toBlock ?? result.progress.toBlock,
          currentBlock: result.progress.currentBlock,
          completion: result.progress.completion
        } : prev.progress, // Fallback to previous progress if none provided
        events: result.events, // Event stats for the processed chunk
        error: result.error // Error details if any
      }));

      // Log the outcome message from the server
      addLog(result.message);
      if (result.events && result.events.newInChunk > 0) {
        addLog(`-> Stored ${result.events.newInChunk} new events from this chunk.`);
      } else if (result.events && result.events.total > 0 && result.events.newInChunk === 0) {
        addLog(`-> Found ${result.events.total} events in this chunk (already stored).`);
      } else if (result.events && result.events.total === 0) {
        addLog(`-> No events found in this chunk.`);
      }

      // Handle errors reported by the server action
      if (result.status === 'error') {
        addLog(`ERROR reported by server: ${result.error || 'Unknown error'}`);
        // Stop further processing
        return;
      }

      // If the server indicates there's a next chunk to process, continue recursively
      if (result.nextStartBlock) {
        // Small delay before next chunk request to avoid overwhelming the server/RPC
        await new Promise(resolve => setTimeout(resolve, 500));

        // Fetch overall status again before starting next chunk (optional, but gives updated context)
        await fetchStatusData();

        addLog(`Continuing extraction from block ${result.nextStartBlock.toLocaleString()}...`);
        // Recursive call for the next chunk
        await runExtraction(result.nextStartBlock, targetEndBlock);
      } else {
        // No nextStartBlock means the process completed (or stopped due to an error handled above)
        if (result.status === 'completed') {
          addLog('Extraction process completed successfully!');
        } else {
          // This case should ideally not be reached if errors are handled correctly above
          addLog('Extraction process finished, but status is not "completed". Check logs.');
        }
        // Final status refresh after completion
        await fetchStatusData();
      }
    } catch (error) {
      // Catch unexpected errors during the client-side execution of this function
      console.error('Client-side chunk extraction error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`CLIENT ERROR processing chunk: ${errorMessage}`);
      // Update status to reflect client-side error and stop
      setExtractionStatus(prev => ({
        ...prev,
        status: 'error',
        message: `Client-side error: ${errorMessage}`,
        error: errorMessage
      }));
      // Optionally re-throw if needed, but usually better to just update state and log
      // throw error;
    }
  };

  // ---- JSX Rendering ----
  return (
    // Main container with padding and background color
    <main className="min-h-screen p-6 bg-gray-50">
      {/* Centered content area with max-width */}
      <div className="w-full max-w-[1200px] mx-auto">
        {/* Main title of the dashboard */}
        <h1 className="text-3xl font-bold mb-8 text-center">HyperMap ETL Dashboard</h1>

        {/* Responsive container for status cards */}
        <div className="cards-container mb-8"> {/* Added margin-bottom */}

          {/* Database Status Card */}
          <div className="bg-white p-6 rounded-lg shadow-md flex-1 basis-0 min-w-0">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Database & Chain Status</h2>

            {/* Loading State */}
            {statusLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin w-8 h-8 border-t-4 border-blue-500 border-solid rounded-full" role="status">
                  <span className="sr-only">Loading status...</span>
                </div>
              </div>
            ) : statusError ? (
              // Error State
              <div className="text-red-600 p-4 border border-red-200 rounded bg-red-50">
                <p className="font-medium">Error Loading Status:</p>
                <p className="text-sm mb-2">{statusError}</p>
                <button
                  onClick={fetchStatusData}
                  className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                  aria-label="Retry loading status"
                >
                  Retry
                </button>
              </div>
            ) : statusData ? (
              // Success State - Display Status Data
              <div>
                {/* Total Events */}
                <div className="mb-4">
                  <p className="text-gray-600 text-sm">Total Events in DB</p>
                  <p className="text-3xl font-bold text-blue-600">{statusData.events.total.toLocaleString()}</p>
                </div>

                {/* Last Processed Block */}
                <div className="mb-4">
                  <p className="text-gray-600 text-sm">Last Block Processed (DB)</p>
                  <p className="text-2xl font-semibold">{statusData.processing.lastBlock.toLocaleString()}</p>
                  {statusData.processing.lastBlock > 0 && (
                    <p className="text-xs text-gray-500">
                      {new Date(statusData.processing.lastBlockTime).toLocaleString()}
                      {' ('}
                      {statusData.processing.hoursAgo > 0
                        ? `${statusData.processing.hoursAgo} hours ago`
                        : 'Less than an hour ago'}
                      {')'}
                    </p>
                  )}

                </div>

                {/* Latest Block on Chain */}
                <div>
                  <p className="text-gray-600 text-sm">Latest Block (Base Chain)</p>
                  <p className="text-2xl font-semibold">
                    {statusData.processing.latestBlockNumber > 0
                      ? statusData.processing.latestBlockNumber.toLocaleString()
                      : <span className="text-orange-500 text-lg">Unavailable</span>
                    }
                  </p>
                  {/* Show sync status */}
                  {statusData.processing.latestBlockNumber > 0 && statusData.processing.lastBlock > 0 && (
                    <p className={`text-xs ${statusData.processing.latestBlockNumber - statusData.processing.lastBlock < 10 ? 'text-green-600' : 'text-orange-600'}`}>
                      {statusData.processing.latestBlockNumber - statusData.processing.lastBlock <= 0
                        ? 'Fully Synced'
                        : `${(statusData.processing.latestBlockNumber - statusData.processing.lastBlock).toLocaleString()} blocks behind`
                      }
                    </p>
                  )}
                </div>
              </div>
            ) : (
              // No Data State
              <p>No status data available.</p>
            )}
          </div>

          {/* Events by Type Card */}
          <div className="bg-white p-6 rounded-lg shadow-md flex-1 basis-0 min-w-0">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Events by Type (DB)</h2>
            {statusLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin w-8 h-8 border-t-4 border-blue-500 border-solid rounded-full" role="status">
                  <span className="sr-only">Loading event types...</span>
                </div>
              </div>
            ) : statusError ? (
              <div className="text-red-500 p-4 border border-red-200 rounded bg-red-50">
                {statusError}
              </div>
            ) : statusData && statusData.events.byType.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-left text-gray-600">
                      <th className="py-2 px-3 font-medium">Type</th>
                      <th className="py-2 px-3 text-right font-medium">Count</th>
                      <th className="py-2 px-3 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusData.events.byType.map((event, i) => (
                      <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors duration-150`}>
                        <td className="py-1.5 px-3">
                          <Link href={`/events?type=${event.type}`} className="text-blue-600 hover:underline font-medium">
                            {event.type}
                          </Link>
                        </td>
                        <td className="py-1.5 px-3 text-right">{event.count.toLocaleString()}</td>
                        <td className="py-1.5 px-3 text-right">{event.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No event data available in the database.</p>
            )}
          </div>

          {/* Extract Events Card */}
          <div className="bg-white p-6 rounded-lg shadow-md flex-1 basis-0 min-w-0">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Extract Events</h2>

            {/* Extraction Form */}
            <form
              onSubmit={(e) => { e.preventDefault(); startExtraction(); }}
              className="mb-4"
              aria-labelledby="extract-heading"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="start-block" className="block text-sm font-medium text-gray-700 mb-1">
                    Start Block <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="start-block"
                    type="number"
                    value={startBlock}
                    onChange={(e) => setStartBlock(e.target.value)}
                    placeholder="e.g., 27270000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    required
                    min="0"
                    aria-required="true"
                    disabled={extractionStatus.status === 'running'}
                  />
                </div>
                <div>
                  <label htmlFor="end-block" className="block text-sm font-medium text-gray-700 mb-1">
                    End Block (optional)
                  </label>
                  <input
                    id="end-block"
                    type="number"
                    value={endBlock}
                    onChange={(e) => setEndBlock(e.target.value)}
                    placeholder="latest"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    min={startBlock || "0"} // End block >= start block
                    aria-describedby="end-block-desc"
                    disabled={extractionStatus.status === 'running'}
                  />
                  <p id="end-block-desc" className="mt-1 text-xs text-gray-500">Leave blank for &apos;latest&apos;.</p>
                </div>
              </div>

              <button
                type="submit"
                disabled={extractionStatus.status === 'running' || statusLoading} // Disable if status is loading too
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed transition duration-150 ease-in-out"
              >
                {extractionStatus.status === 'running' ? (
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Extraction Running...</span>
                  </div>
                ) : 'Extract Events'}
              </button>
            </form>

            {/* Extraction Progress & Status Display */}
            {extractionStatus.status !== 'idle' && (
              <div aria-live="polite">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">
                    Status: <span className={`font-semibold ${extractionStatus.status === 'running' ? 'text-blue-600' :
                      extractionStatus.status === 'completed' ? 'text-green-600' :
                        extractionStatus.status === 'error' ? 'text-red-600' : 'text-gray-700'
                      }`}>
                      {extractionStatus.status.charAt(0).toUpperCase() + extractionStatus.status.slice(1)}
                    </span>
                  </p>
                  {extractionStatus.progress && (
                    <p className="text-sm text-gray-600">
                      {extractionStatus.progress.completion}% Complete
                    </p>
                  )}
                </div>

                {/* Progress Bar */}
                {extractionStatus.progress && (
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-300 ease-out ${extractionStatus.status === 'error' ? 'bg-red-500' :
                        extractionStatus.status === 'completed' ? 'bg-green-500' : 'bg-blue-600'
                        }`}
                      style={{ width: `${Math.min(100, extractionStatus.progress.completion)}%` }}
                      role="progressbar"
                      aria-valuenow={extractionStatus.progress.completion}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Extraction progress"
                    ></div>
                  </div>
                )}

                {/* Progress Details */}
                {extractionStatus.progress && (
                  <p className="text-xs text-gray-500 mb-3">
                    Processing Block: {extractionStatus.progress.currentBlock.toLocaleString()}
                    (Target: {extractionStatus.progress.toBlock > 0 ? extractionStatus.progress.toBlock.toLocaleString() : 'latest'})
                  </p>
                )}


                {/* Event Stats for Current/Last Chunk */}
                {extractionStatus.events && (
                  <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-md text-xs">
                    <p className="font-medium mb-1">Last Chunk Stats ({extractionStatus.progress?.fromBlock.toLocaleString()} - {extractionStatus.progress?.currentBlock.toLocaleString()}):</p>
                    <p>Events Found: <span className="font-semibold">{extractionStatus.events.total.toLocaleString()}</span></p>
                    <p>New Events Stored: <span className="font-semibold text-green-700">{extractionStatus.events.newInChunk.toLocaleString()}</span></p>
                    {/* Optionally show breakdown by type for the chunk */}
                    {/* {extractionStatus.events.byType.map(e => <p key={e.type}>- {e.type}: {e.count}</p>)} */}
                  </div>
                )}

                {/* Display Error Message */}
                {extractionStatus.status === 'error' && extractionStatus.error && (
                  <div className="text-red-600 p-3 border border-red-200 rounded bg-red-50 text-xs">
                    <p className="font-medium">Error:</p>
                    <p>{extractionStatus.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div> {/* End of cards-container */}


        {/* Extraction Log Display (appears below cards when active) */}
        {extractionStatus.status !== 'idle' && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-3">Extraction Log</h3>
            <div
              className="bg-gray-900 text-gray-200 p-4 rounded-md text-xs font-mono h-60 overflow-y-auto border border-gray-700"
              role="log"
              aria-live="polite" // Announce log updates
            >
              {extractionStatus.logs.length === 0 ? (
                <p className="text-gray-400 italic">Log is empty.</p>
              ) : (
                extractionStatus.logs.map((log, i) => (
                  // Use index as key is acceptable here as logs are append-only
                  <div key={i} className="whitespace-pre-wrap break-words">{log}</div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}