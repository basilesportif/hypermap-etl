# HyperMap ETL: Event UI Implementation Plan

## Goal

Implement a new UI screen at the `/events` route to display Hypermap events from the MongoDB database. This screen should support filtering by event type and start date, include pagination, and be accessible via links from the main dashboard's "Events by Type (DB)" card.

## Implementation Steps

### Step 1: Modify Main Page (`/app/page.tsx`)

* **File Path:** `/app/page.tsx`
* **Operation:** UPDATE
* **Purpose:** Make the event type rows in the "Events by Type (DB)" card clickable links that navigate to the `/events` page, pre-filtered by the selected type.
* **Changes:**
    1.  Import `Link` from `next/link`.
        ```typescript
        import Link from 'next/link';
        ```
    2.  Locate the `<tbody>` within the "Events by Type (DB)" card (`div` with `<h2>Events by Type (DB)</h2>`).
    3.  Modify the table row (`<tr>`) generation within the `map` function:
        * Wrap the content of the first table cell (`<td>`) containing the event type name with a `<Link>` component.
        * Set the `href` prop of the `<Link>` to `/events?type=${event.type}`.
        * Add styling to the `Link` (e.g., `className="text-blue-600 hover:underline"`) and potentially a hover effect to the `<tr>` (e.g., `hover:bg-blue-50`) for better UX.
* **Example Snippet:**
    ```tsx
    // Inside the return statement of the Home component, within the "Events by Type (DB)" card:
    <tbody>
      {statusData.events.byType.map((event, i) => (
        <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors duration-150`}>
          <td className="py-1.5 px-3">
            {/* Wrap the event type name with a Link */}
            <Link href={`/events?type=${event.type}`} className="text-blue-600 hover:underline font-medium">
              {event.type}
            </Link>
          </td>
          <td className="py-1.5 px-3 text-right">{event.count.toLocaleString()}</td>
          <td className="py-1.5 px-3 text-right">{event.percentage}%</td>
        </tr>
      ))}
    </tbody>
    ```

### Step 2: Create Events Page Component (`/app/events/page.tsx`)

* **File Path:** `/app/events/page.tsx`
* **Operation:** CREATE
* **Purpose:** Create the client-side component for the `/events` route, handling state management, fetching data via server actions, rendering filters, displaying events in a table, and providing pagination.
* **Functionality:**
    1.  **Directive:** Add `'use client';` at the top.
    2.  **Imports:**
        * React hooks: `useState`, `useEffect`, `useCallback`, `Suspense` (optional, for handling Suspense boundaries if needed).
        * Next.js hooks: `useSearchParams`, `useRouter`.
        * Server Action: `getEvents` from `./actions` (or `/app/actions` if defined there).
        * Types: `HypermapEvent`, `GetEventsParams`, `GetEventsResponse` from `/src/types/index.ts`.
        * Components: `Link` from `next/link`.
    3.  **State Variables:**
        * `events`: `HypermapEvent[]` - Stores the fetched events for the current page.
        * `totalEvents`: `number` - Total count of events matching filters.
        * `currentPage`: `number` - Current page number.
        * `eventsPerPage`: `number` - Number of events per page (e.g., 20).
        * `loading`: `boolean` - Indicates if data is being fetched.
        * `error`: `string | null` - Stores error messages.
        * `filterType`: `string` - Selected event type filter.
        * `filterStartDate`: `string` - Selected start date filter (format 'YYYY-MM-DD').
    4.  **Hooks Usage:**
        * `useSearchParams`: Read initial `type`, `page`, `startDate` from the URL on component mount to initialize state.
        * `useRouter`: Used to update URL query parameters when filters or page change (`router.push` or `router.replace`). This allows bookmarking and sharing filtered/paginated views.
        * `useEffect`: Trigger the `WorkspaceEvents` function when `currentPage`, `filterType`, or `filterStartDate` changes. Also trigger on initial mount based on URL params.
    5.  **Data Fetching (`WorkspaceEvents` function):**
        * Wrap the logic in `useCallback` for memoization.
        * Set `loading` to `true`.
        * Call the `getEvents` server action, passing current state values (`currentPage`, `eventsPerPage`, `filterType`, `filterStartDate`).
        * On success, update `events` and `totalEvents` state.
        * On failure, set `error` state.
        * Set `loading` to `false` in a `finally` block.
    6.  **UI Implementation:**
        * **Title:** "HyperMap Events".
        * **Filters:**
            * Dropdown (`<select>`) for `eventType` (options: All, Mint, Fact, Note, etc.). Value bound to `filterType` state.
            * Date input (`<input type="date">`) for `startDate`. Value bound to `filterStartDate` state.
            * Consider an "Apply Filters" button or trigger updates automatically on change (debounced if necessary). Update URL params on filter change.
        * **Loading/Error Display:** Show loading indicators or error messages based on state.
        * **Events Table:**
            * Use `<table>` to display events.
            * Columns: Type, Block #, Timestamp (formatted), Tx Hash (shortened, maybe linked to a block explorer like Basescan), Label (if applicable), Parent Hash (shortened, if applicable).
            * Iterate over the `events` state to render rows.
            * Format timestamp using `new Date(event.timestamp * 1000).toLocaleString()`.
        * **Pagination Controls:**
            * Calculate `totalPages = Math.ceil(totalEvents / eventsPerPage)`.
            * Display "Page X of Y".
            * "Previous" button: Disabled if `currentPage === 1`. On click, decrement `currentPage`, update URL.
            * "Next" button: Disabled if `currentPage >= totalPages`. On click, increment `currentPage`, update URL.
* **Example Structure (Pseudocode):**
    ```tsx
    'use client';
    import { useState, useEffect, useCallback, Suspense } from 'react';
    import { useSearchParams, useRouter } from 'next/navigation';
    import { getEvents } from './actions'; // Or /app/actions
    import { HypermapEvent } from '/src/types';
    import Link from 'next/link';

    // Define constants
    const EVENTS_PER_PAGE = 20;
    const EVENT_TYPES = ['All', 'Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'];

    function EventsContent() {
      const searchParams = useSearchParams();
      const router = useRouter();

      // State
      const [events, setEvents] = useState<HypermapEvent[]>([]);
      const [totalEvents, setTotalEvents] = useState(0);
      const [currentPage, setCurrentPage] = useState(1);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [filterType, setFilterType] = useState('');
      const [filterStartDate, setFilterStartDate] = useState('');

      // Effect to initialize state from URL params
      useEffect(() => {
        const page = parseInt(searchParams.get('page') || '1');
        const type = searchParams.get('type') || '';
        const startDate = searchParams.get('startDate') || '';
        setCurrentPage(page);
        setFilterType(type);
        setFilterStartDate(startDate);
      }, [searchParams]);

      // Fetching logic
      const fetchEvents = useCallback(async (page: number, type: string, startDate: string) => {
        setLoading(true);
        setError(null);
        try {
          const result = await getEvents({
            page: page,
            limit: EVENTS_PER_PAGE,
            type: type === 'All' || type === '' ? undefined : type,
            startDate: startDate || undefined,
          });
          setEvents(result.events);
          setTotalEvents(result.totalCount);
        } catch (err) {
          setError('Failed to fetch events.');
          console.error(err);
        } finally {
          setLoading(false);
        }
      }, []); // Dependencies managed in the trigger effect

      // Effect to fetch data when page or filters change
      useEffect(() => {
        fetchEvents(currentPage, filterType, filterStartDate);
      }, [currentPage, filterType, filterStartDate, fetchEvents]);

      // Handlers for filter/page changes
      const handleFilterChange = () => {
        // Reset to page 1 when filters change
        const newPage = 1;
        setCurrentPage(newPage);
        // Update URL
        const params = new URLSearchParams();
        if (filterType && filterType !== 'All') params.set('type', filterType);
        if (filterStartDate) params.set('startDate', filterStartDate);
        params.set('page', newPage.toString());
        router.push(`/events?${params.toString()}`);
        // Fetching is triggered by useEffect dependency change
      };

      const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
         // Update URL
        const params = new URLSearchParams(searchParams); // Keep existing filters
        params.set('page', newPage.toString());
        router.push(`/events?${params.toString()}`);
         // Fetching is triggered by useEffect dependency change
      };

      const totalPages = Math.ceil(totalEvents / EVENTS_PER_PAGE);

      return (
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">HyperMap Events</h1>

          {/* Filters Section */}
          <div className="flex gap-4 mb-4 p-4 bg-gray-100 rounded">
             {/* Type Filter Dropdown */}
             {/* Date Filter Input */}
             {/* Apply Button (optional) */}
          </div>

          {/* Loading/Error State */}
          {loading && <p>Loading events...</p>}
          {error && <p className="text-red-500">{error}</p>}

          {/* Events Table */}
          {!loading && !error && (
            <>
              <table className="min-w-full bg-white border">
                {/* Table Head */}
                {/* Table Body - map over 'events' */}
              </table>

              {/* Pagination Controls */}
              <div className="mt-4 flex justify-between items-center">
                 {/* Previous Button */}
                 {/* Page X of Y Display */}
                 {/* Next Button */}
              </div>
            </>
          )}
        </div>
      );
    }

    // Export component wrapped in Suspense for searchParams access
    export default function EventsPage() {
      return (
        <Suspense fallback={<div>Loading...</div>}>
          <EventsContent />
        </Suspense>
      );
    }
    ```

### Step 3: Create Server Action (`/app/actions.ts` or `/app/events/actions.ts`)

* **File Path:** `/app/actions.ts` (or create `/app/events/actions.ts` and import necessary functions/models)
* **Operation:** UPDATE (or CREATE if using a new file)
* **Purpose:** Define the server-side function `getEvents` to query MongoDB based on provided filters and pagination parameters.
* **Changes:**
    1.  Import necessary modules: `mongoose`, `HypermapEventModel`, `initMongoConnection`.
    2.  Import types: `HypermapEvent`, `GetEventsParams`, `GetEventsResponse` from `/src/types/index.ts`.
    3.  Define the `async function getEvents(params: GetEventsParams): Promise<GetEventsResponse>`. Add `'use server';` directive if creating a new file.
    4.  **Input Validation/Defaults:**
        * Set default `page` to 1 and `limit` to 20 if not provided.
        * Ensure `page` and `limit` are positive integers.
    5.  **Database Connection:** Ensure MongoDB connection is established (e.g., call `await initMongoConnection(...)` if needed, check `mongoose.connection.readyState`).
    6.  **Build MongoDB Query Filter:**
        * Create an empty `queryFilter` object.
        * If `params.type` is provided and not 'All', add `{ eventType: params.type }` to the filter.
        * If `params.startDate` is provided:
            * Parse the 'YYYY-MM-DD' string into a Date object.
            * Convert the Date object to a Unix timestamp (seconds): `Math.floor(new Date(params.startDate).getTime() / 1000)`.
            * Add `{ timestamp: { $gte: startTimestamp } }` to the filter. (Requires the `timestamp` field to exist and be indexed on `HypermapEventSchema`).
    7.  **Calculate Skip Value:** `const skip = (page - 1) * limit;`.
    8.  **Execute Queries:**
        * Get total count: `const totalCount = await HypermapEventModel.countDocuments(queryFilter);`.
        * Get events for the page:
            ```typescript
            const events = await HypermapEventModel.find(queryFilter)
              .sort({ blockNumber: -1, logIndex: -1 }) // Sort newest first
              .skip(skip)
              .limit(limit)
              .lean(); // Use lean() for performance
            ```
    9.  **Return:** Return `{ events, totalCount }`. Include error handling (try/catch).
* **Note on Timestamps:** Ensure the `timestamp` field in `HypermapEventSchema` (`/src/schemas/index.ts`) is correctly populated during event processing in `/src/lib/services/events.ts` (the `getBlockTimestamp` function is used, which seems correct) and consider adding an index to the `timestamp` field for performance if date filtering is heavily used.

### Step 4: Update Types (`/src/types/index.ts`)

* **File Path:** `/src/types/index.ts`
* **Operation:** UPDATE
* **Purpose:** Define the TypeScript interfaces for the parameters and response of the new `getEvents` server action.
* **Changes:** Add the following interfaces:
    ```typescript
    // Interface for getEvents server action parameters
    export interface GetEventsParams {
      page?: number;        // Page number (default: 1)
      limit?: number;       // Items per page (default: 20)
      type?: string;        // Event type filter (e.g., 'Mint', 'Fact')
      startDate?: string;   // Start date filter (format: 'YYYY-MM-DD')
      // Future filters can be added here (e.g., endDate, block range)
    }

    // Interface for getEvents server action response
    export interface GetEventsResponse {
      events: HypermapEvent[]; // Array of events for the requested page
      totalCount: number;    // Total number of events matching the filters
    }
    ```

### Step 5: Verify Schema and Indexing (No Code Change, Verification Step)

* **Files:** `/src/schemas/index.ts`, `/src/lib/services/events.ts`
* **Action:** Verify that:
    1.  The `HypermapEventSchema` in `/src/schemas/index.ts` includes the `timestamp: { type: Number }` field.
    2.  The `getBlockTimestamp` function in `/src/lib/services/events.ts` is correctly called and its result is stored in the `timestamp` field when events are processed (e.g., within `processEvent` or `parseLogsToEvents`).
    3.  **Recommendation:** Add an index to the `timestamp` field in `HypermapEventSchema` for efficient date filtering:
        ```typescript
        // In /src/schemas/index.ts, within HypermapEventSchema definition:
        timestamp: { type: Number, index: true }, // Add index: true
        ```
        *If you add this index, remember it might take time to build on existing large collections.*

## Completion Criteria

* The "Events by Type (DB)" card on the main page (`/`) links correctly to the `/events` page with the appropriate `type` query parameter.
* The `/events` page loads and displays events from the database.
* Filtering by event type updates the displayed events and the URL.
* Filtering by start date updates the displayed events and the URL.
* Pagination controls allow navigation between pages of events, updating the displayed events and the URL.
* Loading and error states are handled gracefully on the `/events` page.
* The implementation adheres to project structure and coding standards.