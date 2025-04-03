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


# Indexing Configuration
START_BLOCK=27270000
CHUNK_SIZE=20000
BASE_DELAY_MS=1000
```

## Database Schema

We'll be storing the following collections in MongoDB:

1. **HypermapEntries**
   - Stores processed namespace entries
   - Fields: `namehash`, `label`, `parentHash`, `fullName`, `owner`, `gene`, `notes`, `facts`, `children`, `creationBlock`, `lastUpdateBlock`

## Implementation Plan

### Phase 1: Event Indexing

1. **Event Indexer Worker**
   - Connect to Base blockchain using Ethers.js
   - Fetch events in chunks using the contract address
   - Store *only HypermapEntries* in MongoDB

2. **Schema Implementation**
   - Define MongoDB schemas for events and namespaces
   - Create TypeScript interfaces for event data

3. MongoDB Indexes
 - create indexes for the following fields:
   - creationBlock
   - label

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
   - Start indexing by default at the block in the .env file
   - Create visualizations for namespace hierarchy
   - do it like a file directory/explorer
      - show facts/notes differently
      - show children/parent relationships
