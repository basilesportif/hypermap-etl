# HyperMap ETL Architecture

This document describes the architecture and organization of the HyperMap ETL project. Its primary goal is to reliably extract event data from the Base blockchain HyperMap contract and store it in a MongoDB database, providing a simple dashboard for monitoring and triggering the process.

## Directory Structure

hypermap-etl/
├── docs/                 # Documentation (like this file)
│   └── ARCH.md
├── src/
│   ├── abi/              # Contract ABIs (hypermap.abi.json)
│   ├── ai/               # Placeholder for AI-related features (currently empty)
│   ├── app/              # Next.js application (frontend and server actions)
│   │   ├── actions.ts    # Server actions (getStatus, extractEvents) run on the server
│   │   ├── page.tsx      # Main dashboard page (client-side component)
│   │   ├── layout.tsx    # Root layout for the Next.js app
│   │   └── globals.css   # Global CSS styles (Tailwind base)
│   ├── lib/              # Core library code (shared utilities and services)
│   │   └── services/     # Service modules for specific concerns
│   │       ├── events.ts   # Event parsing, normalization, contract/provider setup
│   │       ├── mongodb.ts  # Database connection (Mongoose) and data modeling helpers
│   │       └── rpc.ts      # Reliable JSON-RPC calls with exponential backoff retry logic
│   ├── models/           # Mongoose data models (wrappers around schemas)
│   │   └── index.ts
│   ├── schemas/          # Mongoose schemas defining data structure in MongoDB
│   │   └── index.ts
│   ├── types/            # TypeScript type definitions (events, entries, etc.)
│   │   └── index.ts
│   └── constants.ts      # Shared constant values (contract address, default settings)
├── .env.example          # Example environment variables file
├── .gitignore            # Files and directories ignored by Git
├── next.config.js        # Next.js configuration
├── package.json          # Project dependencies and npm scripts
├── tailwind.config.js    # Tailwind CSS configuration
└── tsconfig.json         # TypeScript compiler configuration

*(Note: `scripts/` directory mentioned in previous versions is not present in the current file map; CLI operations are handled via `npm run <script-name>` pointing to `tsx scripts/...)` if `scripts` dir existed or directly within `package.json`)*

## Core Components

### Blockchain Interaction (`src/lib/services/rpc.ts`)

- Centralizes all direct calls to the Base blockchain JSON-RPC endpoint.
- Provides functions like `getBlockNumberWithRetry`, `getBlockWithRetry`, `getLogsWithRetry`.
- Implements **exponential backoff retry logic** internally to handle common RPC issues like rate limiting (HTTP 429) and transient network errors, ensuring more robust communication.
- Used by `events.ts` (for fetching block timestamps) and `actions.ts` (for fetching logs and latest block number).

### Event Processing (`src/lib/services/events.ts`)

- Handles the logic specific to HyperMap contract events.
- Provides helper functions `createProvider` and `createContract`.
- `parseLogsToEvents`: Takes raw logs (fetched via `rpc.ts`) and uses the contract ABI (`src/abi`) to parse them into structured, typed `HypermapEvent` objects (defined in `src/types`).
- `getBlockTimestamp`: Fetches block timestamps using the reliable `getBlockWithRetry` from `rpc.ts`.
- Normalizes data where necessary (e.g., decoding UTF8 labels from bytes).

### Database Services (`src/lib/services/mongodb.ts` & Mongoose)

- **Connection:** `initMongoConnection` establishes the connection using Mongoose.
- **Schemas (`src/schemas`):** Define the structure of `HypermapEvent` and `HypermapEntry` documents in MongoDB, including indexes.
- **Models (`src/models`):** Mongoose models (`HypermapEventModel`, `HypermapEntryModel`) provide an interface for interacting with the database based on the schemas.
- **Storage:** The `storeEvents` function (currently within `src/app/actions.ts` but conceptually part of DB interaction logic) uses the native MongoDB driver's `bulkWrite` with `upsert` for efficient and idempotent storage of events, using `transactionHash_logIndex` as a unique `_id`.
- *(Note: `processEventsToEntries` logic exists in `mongodb.ts` but doesn't seem actively used by the current dashboard/actions flow. It suggests potential future functionality for building an aggregated 'entry' view.)*

### Server Actions (`src/app/actions.ts`)

- Execute exclusively on the server.
- `getStatus`: Orchestrates fetching overall status by querying the database (via Mongoose models) for event counts/last block and querying the blockchain (via `rpc.ts`) for the latest block number.
- `extractEvents`:
    - Takes a block range (`startBlock`, `endBlockInput`).
    - Resolves the target end block (fetching latest via `rpc.ts` if needed).
    - Calculates the current chunk's range (`chunkEndBlock`).
    - Fetches logs for the chunk using `getLogsWithRetry` from `rpc.ts`.
    - Parses the logs using `parseLogsToEvents` from `events.ts`.
    - Stores the processed events using `storeEvents` (native MongoDB driver `bulkWrite`).
    - Returns a `StatusResponse` detailing the chunk's outcome (status, progress, event stats, next block).

### Frontend Dashboard (`src/app/page.tsx`)

- A client-side React component (`'use client'`).
- **Status Display:** Fetches and displays overall status using the `getStatus` server action. Periodically refreshes this data.
- **Extraction Control:** Provides input fields for `startBlock` and `endBlock`. Calls the `startExtraction` function on form submission.
- **Extraction Process:**
    - `startExtraction`: Validates input and initiates the process by calling `runExtraction`.
    - `runExtraction`: Recursively calls the `extractEvents` server action, chunk by chunk. It uses the `nextStartBlock` from the `StatusResponse` to process the next range until completion or error.
    - Updates the UI with progress (percentage, current block), status messages, chunk-specific event statistics, and detailed logs.
- **State Management:** Uses React `useState` and `useEffect` hooks to manage status data, extraction progress, logs, and input values.

### Type System (`src/types/`)

- Contains TypeScript interfaces for all core data structures:
    - `BaseHypermapEvent` and specific event types (`MintEvent`, `FactEvent`, etc.) -> `HypermapEvent` union type.
    - `HypermapEntry` (though not actively built by the current actions).
    - Helper types (`Bytes`, `Bytes32`, `Address`).
- Ensures type safety throughout the codebase.

## Data Flow (ETL Dashboard)

1.  **User Interaction:** User visits the dashboard (`/`).
2.  **Initial Status:** `page.tsx` calls `getStatus` server action on mount (and periodically).
3.  **`getStatus` (Server):**
    * Connects to MongoDB.
    * Queries `HypermapEventModel` for counts and last block.
    * Calls `getBlockNumberWithRetry` (via `rpc.ts`) to get the latest block from Base.
    * Returns combined status data to the client.
4.  **Status Display:** `page.tsx` updates its state and renders the status cards.
5.  **Extraction Trigger:** User enters a block range and clicks "Extract Events".
6.  **`startExtraction` (Client):** Validates input, resets UI state, calls `runExtraction(startBlock, targetEndBlock)`.
7.  **`runExtraction` (Client Loop):**
    * Calls `extractEvents(currentStartBlock, targetEndBlock)` server action.
8.  **`extractEvents` (Server):**
    * Connects to MongoDB (native driver).
    * Determines chunk range (`currentStartBlock` to `chunkEndBlock`).
    * Calls `getLogsWithRetry` (via `rpc.ts`) to fetch logs for the chunk.
    * Calls `parseLogsToEvents` (via `events.ts`, which uses `rpc.ts` for timestamps) to process logs.
    * Calls `storeEvents` to bulk upsert events into MongoDB using `_id: txHash_logIndex`.
    * Closes DB connection.
    * Returns `StatusResponse` (including `nextStartBlock` if not complete) to the client.
9.  **`runExtraction` (Client Loop):**
    * Receives `StatusResponse`.
    * Updates UI state (progress bar, logs, status message).
    * If `response.nextStartBlock` exists and `status` is not 'error', calls `extractEvents(response.nextStartBlock, targetEndBlock)` again.
    * If `status` is 'completed' or 'error', the loop terminates.
10. **Final Status:** After completion/error, `WorkspaceStatusData` is called again to refresh the main status cards.