# HyperMap ETL Event Ingestion Plan

This document outlines our approach to ingesting events from the Base blockchain and storing them in MongoDB.

## Event Types

Based on the provided example code, we need to handle the following event types from the HyperMap contract:

### Primary Events

1. **Mint** - Creation of new namespace entries
   - Parameters: `parenthash`, `childhash`, `labelhash`, `label`
   - Used to build the hierarchy of entries

2. **Fact** - Permanent data associated with an entry
   - Parameters: `parenthash`, `facthash`, `labelhash`, `label`, `data`
   - Used to store stable facts about an entry

3. **Note** - Mutable data associated with an entry
   - Parameters: `parenthash`, `notehash`, `labelhash`, `label`, `data`
   - Used to store metadata that can change over time

4. **Gene** - Sets the "gene" (associated implementation) for an entry
   - Parameters: `entry`, `gene`

5. **Transfer** - Ownership transfers for entries
   - Parameters: `from`, `to`, `id`
   - Used to track ownership changes

6. **Zero** - Zero address registration
   - Parameters: `zeroTba`

7. **Upgraded** - Contract implementation upgrades
   - Parameters: `implementation`

## Environment Variables

The following environment variables will be needed:

```
# MongoDB Connection
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<database>?retryWrites=true&w=majority

# Base Blockchain RPC
BASE_RPC_URL=https://base-mainnet.infura.io/v3/<api-key>

# Contract Configuration
CONTRACT_ADDRESS=0x000000000044C6B8Cb4d8f0F889a3E47664EAeda

# Indexing Configuration
START_BLOCK=27270000
CHUNK_SIZE=20000
BASE_DELAY_MS=1000
```

## Project Structure

```
/hypermap-etl
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── events/
│   │   │   │   └── route.ts     # API route for event queries
│   │   │   ├── namespaces/
│   │   │   │   └── route.ts     # API route for namespace queries
│   │   │   └── healthcheck/
│   │   │       └── route.ts     # Health check endpoint
│   │   ├── page.tsx             # Main dashboard UI
│   │   └── layout.tsx           # App layout
│   ├── lib/
│   │   ├── mongodb.ts           # MongoDB connection
│   │   ├── blockchain.ts        # Base blockchain connection
│   │   └── utils.ts             # Shared utilities
│   ├── schemas/
│   │   ├── events.ts            # Event schema definitions
│   │   ├── namespace.ts         # Namespace entry schema
│   │   └── index.ts             # Schema exports
│   ├── types/
│   │   ├── events.ts            # TypeScript interfaces for events
│   │   ├── hypermap.ts          # TypeScript interfaces for HyperMap
│   │   └── index.ts             # Type exports
│   ├── ai/
│   │   ├── helpers.ts           # AI helper functions
│   │   ├── analysis.ts          # Event analysis logic
│   │   └── index.ts             # AI module exports
│   └── workers/
│       ├── eventIndexer.ts      # Blockchain event indexing worker
│       ├── namespaceBuilder.ts  # Namespace state builder worker
│       └── metadataFetcher.ts   # Metadata/fact/note processing worker
├── public/
├── plans/
│   └── event_ingestion_plan.md  # This document
├── .env.local                   # Environment variables for local development
└── .env.example                 # Example environment variables
```

## Database Schema

We'll be storing the following collections in MongoDB:

1. **RawEvents**
   - Stores all raw events from the blockchain
   - Fields: `eventName`, `blockNumber`, `transactionHash`, `logIndex`, `parameters`, `timestamp`

2. **NamespaceEntries**
   - Stores processed namespace entries
   - Fields: `namehash`, `label`, `parentHash`, `fullName`, `owner`, `gene`, `notes`, `facts`, `children`, `creationBlock`, `lastUpdateBlock`

3. **MetadataCache**
   - Caches metadata fetched from external URLs
   - Fields: `uri`, `hash`, `content`, `lastFetched`

4. **IndexState**
   - Stores the state of the indexing process
   - Fields: `lastProcessedBlock`, `lastSavedBlock`, `chainId`, `contractAddress`

## Implementation Plan

### Phase 1: Event Indexing

1. **Event Indexer Worker**
   - Connect to Base blockchain using Ethers.js
   - Fetch events in chunks using the contract address
   - Store raw events in MongoDB
   - Track the last processed block

2. **Schema Implementation**
   - Define MongoDB schemas for events and namespaces
   - Create TypeScript interfaces for event data

### Phase 2: Namespace Building

1. **Namespace Builder Worker**
   - Process events to build the namespace hierarchy
   - Track parent-child relationships
   - Store processed namespace entries in MongoDB

2. **Data Transformation**
   - Implement utilities for decoding event data
   - Handle special data types (IP addresses, ports, etc.)

### Phase 3: API and Front-end

1. **API Implementation**
   - Create endpoints for querying events and namespaces
   - Implement filtering and pagination
   - Add health check endpoint

2. **Dashboard UI**
   - Build a simple dashboard for monitoring indexing status
   - Create visualizations for namespace hierarchy

### Phase 4: AI Integration

1. **AI Helpers**
   - Implement functions for analyzing event patterns
   - Create utilities for extracting insights from namespace data

2. **Metadata Analysis**
   - Process and analyze metadata from facts and notes
   - Generate reports on namespace usage patterns

## Technical Considerations

1. **Scalability**
   - Use efficient indexing for MongoDB collections
   - Implement pagination for large result sets
   - Consider sharding for very large datasets

2. **Reliability**
   - Implement robust error handling for RPC connections
   - Add retry logic for failed requests
   - Store indexing state for recovery after failures

3. **Performance**
   - Use batch processing for event handling
   - Implement caching for frequently accessed data
   - Consider using change streams for real-time updates

4. **Security**
   - Properly validate and sanitize all inputs
   - Use environment variables for sensitive configuration
   - Implement rate limiting for public API endpoints

## Next Steps

1. Set up MongoDB connection and schema validation
2. Implement the event indexer to fetch and store events
3. Build the namespace state processor
4. Create API endpoints for querying data
5. Implement a simple monitoring dashboard