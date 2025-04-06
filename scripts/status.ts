/**
 * HyperMap Status Checker
 * Usage: npm run status
 * 
 * Queries MongoDB to provide a status overview of indexed data:
 * 1. Number of total entries
 * 2. Number of entries by event type
 * 3. Last block processed
 */

// Import libraries
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initMongoConnection } from '../src/lib/services/mongodb.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load .env.local only - simple direct approach
const envLocalPath = path.resolve(rootDir, '.env.local');
const envContent = fs.readFileSync(envLocalPath, 'utf8');
const envLines = envContent.split('\n');

for (const line of envLines) {
  if (!line || line.startsWith('#')) continue;
  
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    const value = valueParts.join('=').trim();
    process.env[key.trim()] = value;
  }
}

// Check for required environment variables
if (!process.env.MONGODB_URI) {
  console.error('Error: MONGODB_URI is not defined in .env or .env.local file');
  process.exit(1);
}

// Main status function
async function checkStatus() {
  console.log('Starting HyperMap status check...');
  
  // Connect to MongoDB
  try {
    await initMongoConnection(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
  
  try {
    // Import models after connection
    const { HypermapEventModel, HypermapEntryModel } = 
      await import('../src/models/index.js');
    
    // Skip entries section entirely for now as the collection doesn't exist yet
    
    // 2. Count events by type
    const eventTypes = ['Mint', 'Fact', 'Note', 'Gene', 'Transfer', 'Zero', 'Upgraded'];
    const eventCounts = await Promise.all(
      eventTypes.map(async (type) => {
        const count = await HypermapEventModel.countDocuments({ eventType: type });
        return { type, count };
      })
    );
    
    // Sort by count (descending)
    eventCounts.sort((a, b) => b.count - a.count);
    
    console.log(`\n=== EVENTS BY TYPE ===`);
    console.log("╔════════════╦════════════╗");
    console.log("║ EVENT TYPE ║    COUNT   ║");
    console.log("╠════════════╬════════════╣");
    
    const totalEvents = eventCounts.reduce((sum, { count }) => sum + count, 0);
    
    for (const { type, count } of eventCounts) {
      const percentage = totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0;
      const paddedType = type.padEnd(10);
      const paddedCount = `${count.toLocaleString()} (${percentage}%)`.padStart(10);
      
      console.log(`║ ${paddedType} ║ ${paddedCount} ║`);
    }
    
    console.log("╠════════════╬════════════╣");
    console.log(`║ TOTAL      ║ ${totalEvents.toLocaleString().padStart(10)} ║`);
    console.log("╚════════════╩════════════╝");
    
    // 3. Get last block processed
    const lastEvent = await HypermapEventModel.findOne()
      .sort({ blockNumber: -1 })
      .select('blockNumber timestamp')
      .lean();
    
    console.log(`\n=== PROCESSING STATUS ===`);
    
    if (lastEvent) {
      console.log(`Last block processed: ${lastEvent.blockNumber.toLocaleString()}`);
      
      if (lastEvent.timestamp) {
        const lastBlockDate = new Date(lastEvent.timestamp * 1000);
        const now = new Date();
        const diffMs = now.getTime() - lastBlockDate.getTime();
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        
        console.log(`Last block time: ${lastBlockDate.toISOString()} (${diffHours} hours ago)`);
      }
    } else {
      console.log('No events found in the database');
    }
    
  } catch (error) {
    console.error('Error querying status:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the status checker
checkStatus()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });