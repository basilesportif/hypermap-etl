"use client";

import { useState, useEffect } from 'react';
import { ROOT_HASH } from '../../constants';

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

export default function Explorer() {
  const [loading, setLoading] = useState(true);
  const [currentHash, setCurrentHash] = useState(ROOT_HASH);
  const [currentEntry, setCurrentEntry] = useState<HypermapEntry | null>(null);
  const [children, setChildren] = useState<HypermapEntry[]>([]);
  const [path, setPath] = useState<{hash: string, label: string}[]>([{ hash: ROOT_HASH, label: 'root' }]);
  
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
  
  // Load initial entry
  useEffect(() => {
    fetchEntry(currentHash);
  }, [currentHash]);
  
  // Format property for display
  const formatProperty = (value: any): string => {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
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
    </main>
  );
}