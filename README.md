# HyperMap ETL

This project reads events from the Base blockchain and stores them in MongoDB.

## Getting Started

### Prerequisites

- Node.js 22.14.0 (as specified in .nvmrc)
- MongoDB database

### Installation

1. Clone the repository
2. Install dependencies
   ```bash
   npm install
   ```
3. Create a `.env.local` file based on `.env.example`
   ```bash
   cp .env.example .env.local
   ```
4. Update the `.env.local` file with your MongoDB connection string and other configuration

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Production

```bash
npm run start
```

## Project Structure

- `src/app`: Next.js App Router pages and API routes
- `src/components`: Reusable React components
- `src/lib`: Utility functions and configurations

## Features

- Connect to Base blockchain
- Read and process blockchain events
- Store data in MongoDB
- Serve data through Next.js API routes
