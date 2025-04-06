# HyperMap ETL Architecture

This document describes the architecture and organization of the HyperMap ETL project.

## Directory Structure

```
hypermap-etl/
├── docs/                    # Documentation
├── scripts/                 # Utility scripts (event scanning, indexing)
├── src/
│   ├── abi/                 # Contract ABIs
│   ├── app/                 # Next.js application
│   │   ├── api/             # API routes
│   │   └── explorer/        # Web interface
│   ├── lib/                 # Core library code
│   │   └── services/        # Service modules
│   │       ├── events.ts    # Event processing
│   │       └── mongodb.ts   # Database interactions
│   ├── models/              # Data models
│   ├── schemas/             # Database schemas
│   ├── types/               # TypeScript type definitions
│   └── workers/             # Background workers
└── package.json             # Dependencies and scripts
```

## Core Components

### Event Processing

The event processing is handled in `src/lib/services/events.ts`, which provides:

- Event parsing and normalization
- Type-safe event handling with proper interfaces
- Utility functions for processing different event types

This module is used by both the scanner scripts and the API routes, ensuring consistent
event handling throughout the application.

### Database Services

Database interactions are centralized in `src/lib/services/mongodb.ts`, which provides:

- Connection management
- Collection access
- Query functions for various data retrieval patterns
- Consistency between scripts and API routes

### Scripts

The scripts in the `scripts/` directory are thin wrappers around the core services,
providing command-line interfaces for common operations:

- `scan-events.ts`: Scan and display events without storing them
- `index-events.ts`: Scan and store events in the database

### API Routes

API routes in `src/app/api/` provide HTTP interfaces for:

- Querying event data
- Retrieving entry information
- Controlling the indexing process
- Diagnostic information

### Web UI

The explorer in `src/app/explorer/` provides a web interface for browsing:

- HyperMap entries
- Events associated with entries
- Relationships between entries

## Type System

The `src/types/` directory contains TypeScript interfaces for all data structures used in the application:

- Event types (Mint, Fact, Note, etc.)
- Entry data structures
- API request/response types

### TypeScript Configuration

The project uses TypeScript with ES modules (ESM) throughout:

- The `tsconfig.json` file is configured with `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`
- ESM imports in TypeScript files must include the `.js` extension, even when importing `.ts` files
- The ts-node loader is used to run TypeScript scripts directly (`node --loader ts-node/esm`)
- The package.json has `"type": "module"` to specify ESM as the default module system

## Data Flow

1. Events are emitted by the HyperMap contract on Base
2. Event scanner scripts capture these events
3. Events are processed by the event service
4. Processed events are stored in MongoDB
5. API routes read from MongoDB to serve data
6. Web UI displays the data to users