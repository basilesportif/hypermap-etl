import { NextRequest, NextResponse } from 'next/server';
import { HypermapEventModel } from '../../../models';
import { CONTRACT_ADDRESS } from '../../../constants';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { eventType, startBlock, limit } = data;
    
    // Create sample event for debugging
    const timestamp = Math.floor(Date.now() / 1000);
    
    let sampleEvent;
    
    switch (eventType) {
      case 'Mint':
        sampleEvent = {
          eventType: 'Mint',
          blockNumber: startBlock || 27270000,
          blockHash: '0x' + '1'.repeat(64),
          transactionHash: '0x' + '2'.repeat(64),
          transactionIndex: 0,
          logIndex: 0,
          timestamp,
          parenthash: '0x0000000000000000000000000000000000000000000000000000000000000000',
          childhash: '0x' + '3'.repeat(64),
          labelhash: '0x' + '4'.repeat(64),
          label: 'sample-mint'
        };
        break;
        
      case 'Fact':
        sampleEvent = {
          eventType: 'Fact',
          blockNumber: startBlock || 27270000,
          blockHash: '0x' + '1'.repeat(64),
          transactionHash: '0x' + '2'.repeat(64),
          transactionIndex: 0,
          logIndex: 0,
          timestamp,
          parenthash: '0x' + '3'.repeat(64),
          facthash: '0x' + '5'.repeat(64),
          labelhash: '0x' + '4'.repeat(64),
          label: 'sample-fact',
          data: 'Sample fact data'
        };
        break;
        
      case 'Note':
        sampleEvent = {
          eventType: 'Note',
          blockNumber: startBlock || 27270000,
          blockHash: '0x' + '1'.repeat(64),
          transactionHash: '0x' + '2'.repeat(64),
          transactionIndex: 0,
          logIndex: 0,
          timestamp,
          parenthash: '0x' + '3'.repeat(64),
          notehash: '0x' + '5'.repeat(64),
          labelhash: '0x' + '4'.repeat(64),
          label: 'sample-note',
          data: 'Sample note data'
        };
        break;
        
      case 'Gene':
        sampleEvent = {
          eventType: 'Gene',
          blockNumber: startBlock || 27270000,
          blockHash: '0x' + '1'.repeat(64),
          transactionHash: '0x' + '2'.repeat(64),
          transactionIndex: 0,
          logIndex: 0,
          timestamp,
          entry: '0x' + '3'.repeat(64),
          gene: '0x' + '5'.repeat(64),
        };
        break;
        
      case 'Transfer':
      default:
        sampleEvent = {
          eventType: 'Transfer',
          blockNumber: startBlock || 27270000,
          blockHash: '0x' + '1'.repeat(64),
          transactionHash: '0x' + '2'.repeat(64),
          transactionIndex: 0,
          logIndex: 0,
          timestamp,
          from: '0x0000000000000000000000000000000000000000',
          to: '0x1234567890123456789012345678901234567890',
          id: '0x' + '3'.repeat(64)
        };
        break;
    }
    
    // Create multiple events if limit is specified
    const events = [];
    const count = limit || 1;
    
    for (let i = 0; i < count; i++) {
      const eventCopy = { ...sampleEvent };
      eventCopy.blockNumber = (startBlock || 27270000) + i;
      eventCopy.logIndex = i;
      events.push(eventCopy);
    }
    
    // Save to database
    await HypermapEventModel.insertMany(events);
    
    return NextResponse.json({
      success: true,
      message: `${events.length} sample ${eventType} events created`,
      contractAddress: CONTRACT_ADDRESS
    });
  } catch (error) {
    console.error('Error creating sample events:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}