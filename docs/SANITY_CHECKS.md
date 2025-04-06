# HyperMap ETL Sanity Checks

This document provides reference information for validating the HyperMap ETL system functionality, including known block ranges with events and command examples for verification.

## Known Event Ranges

The following block ranges are known to contain HyperMap contract events and can be used to verify that the scanning and indexing systems are working correctly:

| Block Range | Event Count | Event Types |
|-------------|-------------|-------------|
| 27430000-27434999 | 14 | 8 Note, 4 Transfer, 2 Mint |

## Verification Commands

### Scan Events

To verify the scanning functionality, run the scan-events script with a known block range:

```bash
# Scan the known event range
npm run scan-events -- --from=27430000 --to=27434999

# Expected output should show 14 events:
# 8 Note events (57%)
# 4 Transfer events (29%)
# 2 Mint events (14%)
```

### Index Events

To verify the indexing functionality, you can run the index-events script with the --print flag to avoid storing in the database:

```bash
# Test indexing without storing in database
npm run index-events -- --from=27430000 --to=27434999 --print

# Expected output should show the same 14 events as above
```

To perform an actual database index:

```bash
# Index events into MongoDB
npm run index-events -- --from=27430000 --to=27434999
```

## Continuous Mode Testing

To test the continuous scanning mode:

```bash
# Start from a recent block and scan continuously
npm run scan-events -- --from=27430000 --continuous

# This will scan up to the latest block and then wait for new blocks
```

## Troubleshooting

If no events are found in the expected ranges:

1. Verify the BASE_RPC_URL environment variable is correctly set in .env.local
2. Check that the network connection to the RPC provider is working
3. Confirm the CONTRACT_ADDRESS is correct: 0x000000000044C6B8Cb4d8f0F889a3E47664EAeda
4. Try a larger block range to ensure you're capturing events

If database indexing is not working:

1. Verify the MONGODB_URI environment variable is correctly set in .env.local
2. Check MongoDB connection and authentication
3. Run with --print flag to isolate if the issue is with scanning or database storage