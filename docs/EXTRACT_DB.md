# Alternative Database Integration for Event Extraction

This guide explains how to modify the event extraction process to use a database other than MongoDB.

## Overview

The extraction phase captures blockchain events and stores them in a database. To use an alternative database:

1. Create a database service adapter
2. Update environment variables
3. Modify the extract-events.ts script

## Environment Variables

Add these to your `.env.local` file:

```
# Base configuration (required)
BASE_RPC_URL=https://mainnet.base.org
MONGODB_URI=mongodb://localhost:27017/hypermap

# Alternative DB (choose one)
POSTGRES_URI=postgresql://user:password@localhost:5432/hypermap
MYSQL_URI=mysql://user:password@localhost:3306/hypermap
DB_TYPE=postgres|mysql|mongodb

# Optional tweaking
DB_BATCH_SIZE=100
```

## Database Service Interface

Create a new file in `src/lib/services/db/`:

```typescript
// src/lib/services/db/index.ts

import { HypermapEvent } from '../../../types/index.js';

export interface DatabaseService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  storeEvents(events: HypermapEvent[]): Promise<{
    upsertedCount: number;
    modifiedCount: number;
  }>;
  ensureIndexes(): Promise<void>;
}

// Factory function to get appropriate DB implementation
export function getDatabaseService(dbType: string): DatabaseService {
  switch (dbType.toLowerCase()) {
    case 'postgres':
      return new PostgresService();
    case 'mysql':
      return new MySQLService();
    case 'mongodb':
    default:
      return new MongoDBService();
  }
}
```

## Implementation Example (Postgres)

```typescript
// src/lib/services/db/postgres.ts

import { Pool } from 'pg';
import { DatabaseService } from './index.js';
import { HypermapEvent } from '../../../types/index.js';

export class PostgresService implements DatabaseService {
  private pool: Pool;
  
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.POSTGRES_URI
    });
  }

  async connect(): Promise<void> {
    // Connection happens on first query with pg
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
  }

  async ensureIndexes(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS hypermapevents (
        id TEXT PRIMARY KEY,
        event_type TEXT,
        block_number BIGINT,
        transaction_hash TEXT,
        data JSONB
      );
      
      CREATE INDEX IF NOT EXISTS idx_event_type ON hypermapevents(event_type);
      CREATE INDEX IF NOT EXISTS idx_block_number ON hypermapevents(block_number);
      CREATE INDEX IF NOT EXISTS idx_transaction_hash ON hypermapevents(transaction_hash);
    `);
  }

  async storeEvents(events: HypermapEvent[]): Promise<{ upsertedCount: number; modifiedCount: number }> {
    if (!events.length) return { upsertedCount: 0, modifiedCount: 0 };
    
    const batchSize = Number(process.env.DB_BATCH_SIZE) || 100;
    let upsertedCount = 0;
    let modifiedCount = 0;
    
    // Process in batches
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      
      // Create values and placeholders for bulk insert
      const values = [];
      const placeholders = [];
      
      batch.forEach((event, index) => {
        const baseIdx = index * 5;
        const eventId = `${event.transactionHash}_${event.logIndex}`;
        
        values.push(
          eventId,
          event.eventType,
          event.blockNumber,
          event.transactionHash,
          JSON.stringify(event)
        );
        
        placeholders.push(`($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5})`);
      });
      
      const query = `
        INSERT INTO hypermapevents(id, event_type, block_number, transaction_hash, data)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (id) 
        DO UPDATE SET
          data = EXCLUDED.data
        RETURNING (xmax = 0) AS inserted
      `;
      
      const result = await this.pool.query(query, values);
      
      // Count inserts vs updates
      result.rows.forEach(row => {
        if (row.inserted) upsertedCount++;
        else modifiedCount++;
      });
    }
    
    return { upsertedCount, modifiedCount };
  }
}
```

## Usage in extract-events.ts

```typescript
import { getDatabaseService } from '../src/lib/services/db/index.js';

// In extractEvents() function:
const dbType = process.env.DB_TYPE || 'mongodb';
const dbService = getDatabaseService(dbType);

console.log(`Using ${dbType} database`);
await dbService.connect();
await dbService.ensureIndexes();

// Replace MongoDB-specific code with:
await dbService.storeEvents(allProcessedEvents);

// Finally
await dbService.disconnect();
```

## Implementation Notes

1. Each database adapter must handle:
   - Connection management
   - Schema/table creation
   - Efficient bulk inserts with upsert capability
   - Proper indexing for queries

2. Performance considerations:
   - Use batch processing for large event sets
   - Implement efficient transaction handling
   - Consider connection pooling for production environments