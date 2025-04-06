# HyperMap ETL Scripts

This document provides an overview of the utility scripts available in the HyperMap ETL project.

## Event Scanner Scripts

### scan-events.mjs

The event scanner processes blockchain events from the HyperMap contract on Base.

```
Usage: npm run scan-events -- --from=27270000 [--to=27280000] [--continuous]
```

Options:
- `--from=<block>`: Starting block number (defaults to 27270000)
- `--to=<block>`: Ending block number (defaults to 'latest')
- `--continuous`, `-c`: Keep scanning for new blocks after reaching latest block

This script scans for events from the HyperMap contract within the specified block range
and prints them to the console. It does not store events in the database.

In continuous mode, the scanner will wait for new blocks after catching up to the chain head,
polling every 30 seconds to check for new blocks.

Example:
```bash
# Scan a specific range
npm run scan-events -- --from=28000000 --to=28100000

# Scan from block 28000000 to the latest block
npm run scan-events -- --from=28000000 

# Continuously scan from block 28000000, including new blocks as they're mined
npm run scan-events -- --from=28000000 --continuous
```

### index-events.mjs

The event indexer processes blockchain events and stores them in MongoDB.

```
Usage: npm run index-events -- --from=27270000 [--to=27280000] [--print]
```

Options:
- `--from=<block>`: Starting block number (defaults to 27270000)
- `--to=<block>`: Ending block number (defaults to 'latest')
- `--print`: Only print events, don't store in database

This script scans for events from the HyperMap contract within the specified block range
and stores them in MongoDB. It requires the `MONGODB_URI` environment variable to be set.

Example:
```bash
# Index a specific range
npm run index-events -- --from=28000000 --to=28100000

# Index from block 28000000 to the latest block
npm run index-events -- --from=28000000 

# Preview events without storing them
npm run index-events -- --from=28000000 --print
```

## Database Structure

Events are stored in MongoDB with the following schema:

- `eventType`: The type of event (Mint, Fact, Note, Gene, Transfer, Zero, Upgraded)
- `blockNumber`: The block number where the event occurred
- `timestamp`: The timestamp of the block
- `transactionHash`: The transaction hash containing the event
- Additional fields depending on the event type

Each event type includes specific fields:
- **Mint**: parenthash, childhash, labelhash, label
- **Fact**: parenthash, facthash, labelhash, label, data
- **Note**: parenthash, notehash, labelhash, label, data
- **Gene**: entry, gene
- **Transfer**: from, to, id
- **Zero**: zeroTba
- **Upgraded**: implementation