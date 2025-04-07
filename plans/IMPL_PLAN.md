# Implementation Plan: Enhance /events Page Display

## 1. Feature Description

This plan outlines the steps to enhance the `/events` page in the HyperMap ETL application. The goal is to display all relevant fields for each distinct `HypermapEvent` type, ensuring the data presentation aligns with the event's specific schema. A key part of this enhancement is implementing custom decoding logic for the `data` field present in `FactEvent` and `NoteEvent` types, based on the associated `label`.

## 2. LLM Instructions

**IMPORTANT:** You MUST follow ONLY the steps outlined in this plan. Do NOT introduce any other changes, features, or modifications to the codebase beyond what is specified here.

## 3. Files to Modify

### File 1: `src/app/events/page.tsx`

* **File Operation:** UPDATE
* **Feature Specification:**
    1.  **Import necessary utilities:** Import `ethers` for decoding bytes and potentially the `decodeEventData` helper function if created separately. Import all specific event types from `../../types` (e.g., `MintEvent`, `FactEvent`, etc.) if needed for type checking within the component, although checking `eventType` string might suffice.
    2.  **Create Data Decoding Helper Function:** Implement a helper function `decodeEventData(label: string, data: string): string | number | JSX.Element` within the component or import it. This function will handle the decoding logic:
        * Input: `label` (string), `data` (hex string Bytes).
        * If `label` is "~ip" or "~port", decode `data` as an integer using `ethers.toBigInt()` and convert to `Number` (handle potential BigInt size issues if necessary).
        * If `label` is "~net-key" or "~routers", return the raw hex `data` (potentially shortened using `shortenHash`).
        * For any other `label`, attempt to decode `data` as a UTF-8 string using `ethers.toUtf8String()`.
        * Implement robust error handling for decoding (e.g., invalid UTF-8, non-numeric hex for int conversion). On error, return a user-friendly message like "Invalid Data" or show the shortened raw hex.
        * Return type can be `string | number` or `JSX.Element` to allow formatting (e.g., wrapping hex in `<code>`).
    3.  **Adjust Table Structure:** Modify the `<table>` in the `EventsContent` component. Instead of fixed columns for `Label` and `Parent Hash`, consider a more flexible structure. Options:
        * **Option A (More Columns):** Add specific columns for all possible relevant fields (`childhash`, `facthash`, `notehash`, `labelhash`, `data`, `entry`, `gene`, `from`, `to`, `id`, `zeroTba`, `implementation`). Use conditional rendering within `<tbody>` `<tr>` to populate only the relevant cells for each `event.eventType`, leaving others empty or showing 'N/A'. This might lead to a very wide table.
        * **Option B (Details Column):** Keep fewer primary columns (e.g., Type, Block, Timestamp, Tx Hash) and add a "Details" column. Within the "Details" cell (`<td>`), render a structured list or key-value pairs showing all relevant fields for the specific `event.eventType`. This keeps the table narrower.
    4.  **Implement Conditional Rendering:** Inside the `events.map` function, use the chosen structure (Option A or B) to render the specific fields for each event type:
        * Access fields directly from the `event` object (e.g., `(event as MintEvent).childhash`). Use type assertions carefully or check for field existence.
        * Use the `shortenHash` helper for all hash and address values.
        * Make `transactionHash` a link to BaseScan (`https://basescan.org/tx/${event.transactionHash}`). Consider linking other hashes/addresses if relevant explorers exist.
        * Call the `decodeEventData` function when rendering the `data` field for `FactEvent` and `NoteEvent`.
        * Ensure all fields from each event type in `src/types/index.ts` are displayed appropriately.
    5.  **Update Table Headers:** Adjust `<thead>` to match the chosen column structure.
    6.  **Maintain Existing Functionality:** Ensure existing filtering, pagination, loading, and error states still work correctly.

* **Helper Code/Pseudocode:**

    ```typescript
    // Import ethers if not already imported at the top
    import { ethers } from 'ethers';
    import { MintEvent, FactEvent, NoteEvent, GeneEvent, TransferEvent, ZeroEvent, UpgradedEvent } from '../../types'; // Import specific types if using assertions

    // --- Inside EventsContent component ---

    // Helper function for decoding data
    function decodeEventData(label: string, data: string): string | number | JSX.Element {
      if (!data || data === '0x' || data === '') return <span className="text-gray-400">N/A</span>; // Handle empty data gracefully

      try {
        if (label === '~ip' || label === '~port') {
          // Decode hex to BigInt, then to Number. Handle potential errors/large numbers.
          const value = ethers.toBigInt(data);
          // Decide if Number is appropriate or if BigInt needs special handling/string conversion
          if (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) {
            return Number(value);
          } else {
            return value.toString(); // Return as string if too large for Number
          }
        } else if (label === '~net-key' || label === '~routers') {
          // Return hex, potentially shortened, wrapped in code tags
          return <code title={data}>{shortenHash(data)}</code>;
        } else {
          // Try decoding as UTF-8
          return ethers.toUtf8String(data);
        }
      } catch (e) {
        // Handle decoding errors
        console.error(`Error decoding data for label "${label}" (data: ${data}):`, e);
        // Return error message with shortened hex data for context
        return <span className="text-red-500" title={`Error decoding raw data: ${data}`}>Invalid Data ({shortenHash(data)})</span>;
      }
    }

    // --- Inside the return JSX, within the table body mapping ---

    // Example using Option B (Details Column)
    // ... (existing columns: Type, Block, Timestamp, Tx Hash) ...
    <td className="py-3 px-4 border-b text-xs align-top">
      <div className="space-y-1">
        {event.eventType === 'Mint' && (
          <>
            <div><strong>Parent:</strong> <code title={event.parenthash}>{shortenHash(event.parenthash)}</code></div>
            <div><strong>Child:</strong> <code title={event.childhash}>{shortenHash(event.childhash)}</code></div>
            <div><strong>Label:</strong> {event.label}</div>
            <div><strong>LabelHash:</strong> <code title={event.labelhash}>{shortenHash(event.labelhash)}</code></div>
          </>
        )}
        {event.eventType === 'Fact' && (
          <>
            <div><strong>Parent:</strong> <code title={event.parenthash}>{shortenHash(event.parenthash)}</code></div>
            <div><strong>FactHash:</strong> <code title={event.facthash}>{shortenHash(event.facthash)}</code></div>
            <div><strong>Label:</strong> {event.label}</div>
            <div><strong>LabelHash:</strong> <code title={event.labelhash}>{shortenHash(event.labelhash)}</code></div>
            <div><strong>Data:</strong> {decodeEventData(event.label, event.data)}</div>
          </>
        )}
        {event.eventType === 'Note' && (
           <>
            <div><strong>Parent:</strong> <code title={event.parenthash}>{shortenHash(event.parenthash)}</code></div>
            <div><strong>NoteHash:</strong> <code title={event.notehash}>{shortenHash(event.notehash)}</code></div>
            <div><strong>Label:</strong> {event.label}</div>
            <div><strong>LabelHash:</strong> <code title={event.labelhash}>{shortenHash(event.labelhash)}</code></div>
            <div><strong>Data:</strong> {decodeEventData(event.label, event.data)}</div>
           </>
        )}
        {event.eventType === 'Gene' && (
          <>
            <div><strong>Entry:</strong> <code title={event.entry}>{shortenHash(event.entry)}</code></div>
            <div><strong>Gene Addr:</strong> <code title={event.gene}>{shortenHash(event.gene)}</code></div>
          </>
        )}
        {event.eventType === 'Transfer' && (
           <>
            <div><strong>From:</strong> <code title={event.from}>{shortenHash(event.from)}</code></div>
            <div><strong>To:</strong> <code title={event.to}>{shortenHash(event.to)}</code></div>
            <div><strong>ID:</strong> <code title={event.id}>{event.id.length > 12 ? shortenHash(event.id) : event.id}</code></div> {/* Shorten ID if it looks like a hash */}
           </>
        )}
         {event.eventType === 'Zero' && (
           <div><strong>Zero TBA:</strong> <code title={event.zeroTba}>{shortenHash(event.zeroTba)}</code></div>
         )}
         {event.eventType === 'Upgraded' && (
           <div><strong>New Impl:</strong> <code title={event.implementation}>{shortenHash(event.implementation)}</code></div>
         )}
      </div>
    </td>
    // ...

    // Adjust table header (<thead>) for Option B:
    // Keep Type, Block #, Timestamp, Tx Hash. Replace Label and Parent Hash with a single "Details" header.
    // Example:
    // <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Details</th>

    ```

## 4. Verification Steps

1.  Run the application (`npm run dev`).
2.  Navigate to the `/events` page.
3.  Ensure the table loads events correctly.
4.  Verify that the table headers reflect the new structure (e.g., a "Details" column if Option B was chosen).
5.  Inspect rows corresponding to different event types (Mint, Fact, Note, Gene, Transfer, Zero, Upgraded). Use the Sanity Checks documentation (`docs/SANITY_CHECKS.md`) to find blocks with known event types if necessary.
6.  Confirm that all relevant fields for each event type are displayed within the table row (either in dedicated columns or the "Details" column).
7.  Check that hashes and addresses are shortened correctly using `shortenHash`.
8.  Verify the `transactionHash` is a clickable link to the correct BaseScan transaction page.
9.  For `Fact` and `Note` events:
    * Find an event with `label` "~ip" or "~port" and confirm the `data` field is displayed as a number.
    * Find an event with `label` "~net-key" or "~routers" and confirm the `data` field is displayed as shortened hex code.
    * Find an event with a different `label` and confirm the `data` field is displayed as a decoded UTF-8 string.
    * Find an event where `data` might be invalid for the expected decoding (e.g., non-UTF8 bytes for a string label) and ensure the error is handled gracefully (e.g., shows "Invalid Data").
10. Test pagination and filtering (by Type and Start Date) to ensure they still function correctly with the new table structure.
11. Check for any console errors in the browser developer tools.

```markdown
# Implementation Plan: Enhance /events Page Display

## 1. Feature Description

This plan outlines the steps to enhance the `/events` page in the HyperMap ETL application. The goal is to display all relevant fields for each distinct `HypermapEvent` type, ensuring the data presentation aligns with the event's specific schema. A key part of this enhancement is implementing custom decoding logic for the `data` field present in `FactEvent` and `NoteEvent` types, based on the associated `label`.

## 2. LLM Instructions

**IMPORTANT:** You MUST follow ONLY the steps outlined in this plan. Do NOT introduce any other changes, features, or modifications to the codebase beyond what is specified here.

## 3. Files to Modify

### File 1: `src/app/events/page.tsx`

* **File Operation:** UPDATE
* **Feature Specification:**
    1.  **Import necessary utilities:** Import `ethers` for decoding bytes.
    2.  **Create Data Decoding Helper Function:** Implement a helper function `decodeEventData(label: string, data: string): string | number | JSX.Element` within the `EventsContent` component. This function will handle the decoding logic:
        * Input: `label` (string), `data` (hex string Bytes).
        * Handle null, undefined, empty string, or '0x' `data` by returning a placeholder (e.g., `N/A`).
        * If `label` is "~ip" or "~port", decode `data` as an integer using `ethers.toBigInt()` and convert to `Number`. Handle potential BigInt size issues (return as string if too large for `Number`).
        * If `label` is "~net-key" or "~routers", return the raw hex `data` (shortened using `shortenHash` and wrapped in `<code>` tags with the full hex as the title attribute).
        * For any other `label`, attempt to decode `data` as a UTF-8 string using `ethers.toUtf8String()`.
        * Implement `try...catch` for robust error handling during decoding. On error, log the error and return a user-friendly error message (e.g., `<span className="text-red-500" title={full_raw_hex_data}>Invalid Data ({shortened_raw_hex})</span>`).
    3.  **Adjust Table Structure (Use Option B - Details Column):** Modify the `<table>` in the `EventsContent` component.
        * Keep the columns: `Type`, `Block #`, `Timestamp`, `Tx Hash`.
        * Remove the `Label` and `Parent Hash` columns.
        * Add a new column with the header `Details`.
    4.  **Implement Conditional Rendering in "Details" Column:** Inside the `events.map` function, within the new `<td>` for the "Details" column, use conditional logic based on `event.eventType` to render a structured view (`div`s with labels and values) of all relevant fields for that specific event type.
        * Use `shortenHash` for all hash (`Bytes32`) and address (`Address`) values. Wrap them in `<code>` tags and provide the full value in the `title` attribute for hover-over visibility.
        * Make `transactionHash` a link to BaseScan (`https://basescan.org/tx/${event.transactionHash}`) in its dedicated column.
        * Call the `decodeEventData` function when rendering the `data` field for `FactEvent` and `NoteEvent` within the "Details" cell.
        * Ensure all fields defined in the corresponding event interface in `src/types/index.ts` are displayed. For `TransferEvent`, shorten the `id` if it's long (like a hash), otherwise display it fully.
    5.  **Update Table Headers:** Modify the `<thead>` to reflect the new column structure: `Type`, `Block #`, `Timestamp`, `Tx Hash`, `Details`.
    6.  **Maintain Existing Functionality:** Ensure existing filtering (by Type, Start Date), pagination, loading states, and error handling remain fully functional.

* **Helper Code/Pseudocode:**

    ```typescript
    // Import ethers
    import { ethers } from 'ethers';
    // Specific event types might not be needed if just checking event.eventType string and field existence

    // --- Inside EventsContent component ---

    // Helper function for decoding data
    function decodeEventData(label: string, data: string): string | number | JSX.Element {
      if (!data || data === '0x' || data === '') return <span className="text-gray-400">N/A</span>;

      try {
        if (label === '~ip' || label === '~port') {
          const value = ethers.toBigInt(data);
          if (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) {
            return Number(value);
          } else {
            return value.toString();
          }
        } else if (label === '~net-key' || label === '~routers') {
          return <code title={data}>{shortenHash(data)}</code>;
        } else {
          return ethers.toUtf8String(data);
        }
      } catch (e) {
        console.error(`Error decoding data for label "${label}" (data: ${data}):`, e);
        return <span className="text-red-500" title={`Error decoding raw data: ${data}`}>Invalid Data ({shortenHash(data)})</span>;
      }
    }

    // --- Inside the return JSX ---

    // Update <thead>
    <thead className="bg-gray-100">
      <tr>
        <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Type</th>
        <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Block #</th>
        <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Timestamp</th>
        <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Tx Hash</th>
        <th className="py-3 px-4 text-left text-sm font-medium text-gray-600">Details</th> {/* New Details column */}
      </tr>
    </thead>

    // Update <tbody> mapping
    <tbody>
      {events.length === 0 ? (
        <tr>
          <td colSpan={5} className="py-4 px-6 text-center text-gray-500"> {/* Updated colSpan to 5 */}
            No events found matching the current filters.
          </td>
        </tr>
      ) : (
        events.map((event, index) => (
          <tr
            key={`<span class="math-inline">\{event\.transactionHash\}\_</span>{event.logIndex}`}
            className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
          >
            {/* Existing columns */}
            <td className="py-3 px-4 border-b">
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                {event.eventType}
              </span>
            </td>
            <td className="py-3 px-4 border-b">
              {event.blockNumber.toLocaleString()}
            </td>
            <td className="py-3 px-4 border-b">
              {formatTimestamp(event.timestamp)}
            </td>
            <td className="py-3 px-4 border-b">
              <a
                href={`https://basescan.org/tx/${event.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                <code title={event.transactionHash}>{shortenHash(event.transactionHash)}</code>
              </a>
            </td>

            {/* New Details Column */}
            <td className="py-3 px-4 border-b text-xs align-top">
              <div className="space-y-1">
                {/* Conditional rendering based on eventType */}
                {event.eventType === 'Mint' && (
                  <>
                    <div><strong>Parent:</strong> <code title={event.parenthash}>{shortenHash(event.parenthash)}</code></div>
                    <div><strong>Child:</strong> <code title={event.childhash}>{shortenHash(event.childhash)}</code></div>
                    <div><strong>Label:</strong> {event.label || <span className="text-gray-400">N/A</span>}</div>
                    <div><strong>LabelHash:</strong> <code title={event.labelhash}>{shortenHash(event.labelhash)}</code></div>
                  </>
                )}
                {event.eventType === 'Fact' && (
                  <>
                    <div><strong>Parent:</strong> <code title={event.parenthash}>{shortenHash(event.parenthash)}</code></div>
                    <div><strong>FactHash:</strong> <code title={event.facthash}>{shortenHash(event.facthash)}</code></div>
                    <div><strong>Label:</strong> {event.label || <span className="text-gray-400">N/A</span>}</div>
                    <div><strong>LabelHash:</strong> <code title={event.labelhash}>{shortenHash(event.labelhash)}</code></div>
                    <div><strong>Data:</strong> {decodeEventData(event.label, event.data)}</div>
                  </>
                )}
                {event.eventType === 'Note' && (
                   <>
                    <div><strong>Parent:</strong> <code title={event.parenthash}>{shortenHash(event.parenthash)}</code></div>
                    <div><strong>NoteHash:</strong> <code title={event.notehash}>{shortenHash(event.notehash)}</code></div>
                    <div><strong>Label:</strong> {event.label || <span className="text-gray-400">N/A</span>}</div>
                    <div><strong>LabelHash:</strong> <code title={event.labelhash}>{shortenHash(event.labelhash)}</code></div>
                    <div><strong>Data:</strong> {decodeEventData(event.label, event.data)}</div>
                   </>
                )}
                {event.eventType === 'Gene' && (
                  <>
                    <div><strong>Entry:</strong> <code title={event.entry}>{shortenHash(event.entry)}</code></div>
                    <div><strong>Gene Addr:</strong> <code title={event.gene}>{shortenHash(event.gene)}</code></div>
                  </>
                )}
                {event.eventType === 'Transfer' && (
                   <>
                    <div><strong>From:</strong> <code title={event.from}>{shortenHash(event.from)}</code></div>
                    <div><strong>To:</strong> <code title={event.to}>{shortenHash(event.to)}</code></div>
                    {/* Handle potential bigint string for ID */}
                    <div><strong>ID:</strong> <code title={event.id.toString()}>{event.id.toString().length > 12 ? shortenHash(event.id.toString()) : event.id.toString()}</code></div>
                   </>
                )}
                 {event.eventType === 'Zero' && (
                   <div><strong>Zero TBA:</strong> <code title={event.zeroTba}>{shortenHash(event.zeroTba)}</code></div>
                 )}
                 {event.eventType === 'Upgraded' && (
                   <div><strong>New Impl:</strong> <code title={event.implementation}>{shortenHash(event.implementation)}</code></div>
                 )}
                 {/* Add other event types as needed */}
              </div>
            </td>
          </tr>
        ))
      )}
    </tbody>

    ```

## 4. Verification Steps

1.  Run the application (`npm run dev`).
2.  Navigate to the `/events` page.
3.  Ensure the table loads events correctly.
4.  Verify the table headers are: `Type`, `Block #`, `Timestamp`, `Tx Hash`, `Details`.
5.  Inspect rows corresponding to different event types (Mint, Fact, Note, Gene, Transfer, Zero, Upgraded). Use `docs/SANITY_CHECKS.md` if needed.
6.  Confirm that all relevant fields for each event type are displayed within the "Details" column, correctly labelled.
7.  Check that hashes and addresses are shortened, wrapped in `<code>`, and show the full value on hover.
8.  Verify the `transactionHash` is a clickable link to BaseScan.
9.  For `Fact` and `Note` events:
    * Check `~ip`/`~port` labels display data as a number.
    * Check `~net-key`/`~routers` labels display data as shortened hex in `<code>`.
    * Check other labels display data as a UTF-8 string.
    * Verify graceful error handling (e.g., "Invalid Data") for decoding issues.
10. Test pagination and filtering (Type, Start Date) to ensure they remain functional.
11. Check the browser's developer console for errors.