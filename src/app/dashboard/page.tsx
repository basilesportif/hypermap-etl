'use client';

import { useState, useEffect } from 'react';
import { getStatus } from './actions';

// Status response interface
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

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchStatus() {
      try {
        setLoading(true);
        const result = await getStatus();
        setStatus(result);
        setError(null);
      } catch (err) {
        setError('Failed to load status data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchStatus();
    
    // Refresh every 60 seconds
    const intervalId = setInterval(fetchStatus, 60000);
    return () => clearInterval(intervalId);
  }, []);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Loading HyperMap Status...</h1>
          <div className="animate-pulse w-8 h-8 border-t-4 border-blue-500 border-solid rounded-full mx-auto"></div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen p-6 bg-red-50">
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
  
  if (!status) {
    return <div>No data available</div>;
  }
  
  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">HyperMap Status Dashboard</h1>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Events Summary Card */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Events Summary</h2>
            <div className="mb-4">
              <p className="text-3xl font-bold text-blue-600">{status.events.total.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Total Events Indexed</p>
            </div>
            
            <h3 className="font-medium mt-6 mb-3">Events by Type</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-3 text-left">Event Type</th>
                    <th className="py-2 px-3 text-right">Count</th>
                    <th className="py-2 px-3 text-right">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {status.events.byType.map((event, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="py-2 px-3 font-medium">{event.type}</td>
                      <td className="py-2 px-3 text-right">{event.count.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right">{event.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Processing Status Card */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Processing Status</h2>
            
            <div className="mb-6">
              <p className="font-medium mb-1">Last Block Processed</p>
              <p className="text-2xl">{status.processing.lastBlock.toLocaleString()}</p>
            </div>
            
            <div className="mb-6">
              <p className="font-medium mb-1">Last Block Time</p>
              <p className="text-lg">{new Date(status.processing.lastBlockTime).toLocaleString()}</p>
              <p className="text-sm text-gray-500">
                {status.processing.hoursAgo > 0 
                  ? `${status.processing.hoursAgo} hours ago`
                  : 'Less than an hour ago'}
              </p>
            </div>
            
            <div className="mb-6">
              <p className="font-medium mb-1">Refresh Status</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Refresh Now
              </button>
            </div>
          </div>
        </div>
        
        <p className="text-center text-gray-500 text-sm mt-8">
          Data auto-refreshes every 60 seconds
        </p>
      </div>
    </div>
  );
}