# Implementation Plan: Refactor /events Page Table

## 1. Feature Description

Refactor the event display table on the `/events` page (`src/app/events/page.tsx`). The goal is to simplify the main table view by showing key information directly and hiding less frequently needed details within an expandable section for each event row.

**New Table Columns:**

1.  **Type:** Event type (e.g., Mint, Fact).
2.  **Label:** The `label` associated with the event (decoded UTF-8 string).
3.  **Data:** Decoded data based on the label, or shortened hash/raw data if not easily decodable.
4.  **Block:** Block number.
5.  **Details Toggle:** A button (e.g., chevron icon) to expand/collapse the details section.

**Expandable Details Section:**

This section will appear below the main row when expanded and will contain:

* Timestamp
* Transaction Hash (linked to BaseScan)
* Parent Hash / Child Hash / Fact Hash / Note Hash / Entry Hash (as applicable)
* Label Hash
* From/To Addresses / ID (for Transfers)
* Zero TBA Address (for Zero)
* Implementation Address (for Upgraded)
* Any other relevant fields currently shown in the details column.

## 2. LLM Instructions

**ONLY implement the changes described in this plan. DO NOT modify any other files or functionality.**

* Focus solely on updating the `src/app/events/page.tsx` file as specified.
* Ensure the new table structure is implemented correctly.
* Implement the row expansion functionality using React state.
* Use appropriate icons (e.g., chevron up/down) for the toggle button.
* Maintain existing functionality like filtering, pagination, and links.
* Ensure the component remains responsive and handles loading/error states correctly.

## 3. Files to Modify

* **File Operation:** UPDATE
* **File Path:** `src/app/events/page.tsx`
* **Feature Specification:**
    * Modify the `EventsContent` functional component.
    * Introduce state to manage the expanded/collapsed status of each row. A `useState({})` hook holding an object where keys are event IDs (`${event.transactionHash}_${event.logIndex}`) and values are booleans (true for expanded, false for collapsed) would work.
    * Update the table `<thead>` to reflect the new columns: "Type", "Label", "Data", "Block", "" (for the toggle button).
    * Modify the table `<tbody>` rendering:
        * Use `React.Fragment` or render two `<tr>` elements per event.
        * The first `<tr>` will contain the main columns (Type, Label, Data, Block) and the toggle button.
        * The toggle button's `onClick` handler will update the expansion state for that specific row.
        * The second `<tr>` will contain the details. It should have a `colSpan` equal to the total number of columns in the header. Its visibility will be conditional based on the expansion state for that row.
        * Move the detailed data rendering logic (hashes, timestamp, Tx Hash link, etc.) from the current "Details" column into this second, collapsible `<tr>`.
    * Add appropriate styling for the details row (e.g., padding, background color) and the toggle button.
* **Pseudocode/Helpful Code Snippets:**

    ```tsx
    // State for expansion
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

    // Toggle function
    const toggleRow = (eventId: string) => {
      setExpandedRows(prev => ({
        ...prev,
        [eventId]: !prev[eventId]
      }));
    };

    // Inside the table body map:
    <tbody>
      {events.map((event, index) => {
        const eventId = `${event.transactionHash}_${event.logIndex}`;
        const isExpanded = expandedRows[eventId] || false;

        return (
          <React.Fragment key={eventId}>
            {/* Main Row */}
            <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="py-3 px-4 border-b">{/* Type */}</td>
              <td className="py-3 px-4 border-b">{/* Label */}</td>
              <td className="py-3 px-4 border-b">{/* Data */}</td>
              <td className="py-3 px-4 border-b">{/* Block */}</td>
              <td className="py-3 px-4 border-b text-center">
                <button onClick={() => toggleRow(eventId)} className="p-1 rounded hover:bg-gray-200">
                  {/* Chevron Icon based on isExpanded state */}
                  {isExpanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                </button>
              </td>
            </tr>

            {/* Details Row (Conditional) */}
            {isExpanded && (
              <tr className="bg-gray-100">
                <td colSpan={5} className="py-3 px-6 border-b">
                  {/* Render ALL detailed event information here */}
                  <div><strong>Timestamp:</strong> {formatTimestamp(event.timestamp)}</div>
                  <div>
                     <strong>Tx Hash:</strong>
                     <a href={`https://basescan.org/tx/${event.transactionHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                       <code title={String(event.transactionHash)}>{shortenHash(event.transactionHash)}</code>
                     </a>
                  </div>
                  {/* ... other details based on event type ... */}
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}
    </tbody>

    // Need to import Chevron icons, e.g., from heroicons
    // import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid'; // Or outline version
    ```