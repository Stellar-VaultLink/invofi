# VaultLink

A decentralized invoice financing protocol built on Stellar Soroban.

## Overview

VaultLink enables businesses to tokenize invoices as NFTs on Stellar and obtain immediate financing from investors. The protocol consists of:

- **Backend**: NestJS API with JWT authentication and Stellar wallet signature verification
- **Smart Contracts**: Soroban Rust contracts for invoice NFTs and financing pools
- **Database**: PostgreSQL with TypeORM for data persistence
- **Cache**: Redis for session management and caching

## Architecture

```
vaultlink/
├── apps/
│   ├── backend/      # NestJS API server
│   └── contracts/    # Soroban Rust smart contracts
├── docs/             # Documentation
├── docker-compose.yml
└── README.md
```

## Prerequisites

- Node.js 18+
- Rust 1.70+ (for Soroban contracts)
- Docker & Docker Compose
- PostgreSQL 16+ (via Docker)
- Redis 7+ (via Docker)

## Quick Start

### 1. Clone and Setup Environment

```bash
cd vaultlink
cp .env.example .env
```

### 2. Start Infrastructure

```bash
docker-compose up -d postgres redis
```

### 3. Setup Backend

```bash
cd apps/backend
npm install
npm run migration:run
npm run start:dev
```

The API will be available at http://localhost:3000

### 4. Build and Deploy Contracts

```bash
cd apps/contracts
cargo build --release
# Deploy to Stellar testnet
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/vaultlink_core.wasm
```

## API Endpoints

### Authentication

- `POST /auth/connect-wallet` - Connect Stellar wallet
- `POST /auth/verify-signature` - Verify wallet signature
- `POST /auth/refresh` - Refresh JWT token

### Invoices

- `GET /invoices` - List all invoices
- `POST /invoices` - Create new invoice
- `GET /invoices/:id` - Get invoice details
- `PUT /invoices/:id` - Update invoice
- `DELETE /invoices/:id` - Delete invoice

### Financing

- `GET /financing/offers` - List financing offers
- `POST /financing/offers` - Create financing offer
- `POST /financing/offers/:id/accept` - Accept financing offer

## Environment Variables

| Variable            | Description                  | Default |
| ------------------- | ---------------------------- | ------- |
| DATABASE_URL        | PostgreSQL connection string | -       |
| REDIS_URL           | Redis connection string      | -       |
| JWT_SECRET          | Secret for JWT signing       | -       |
| STELLAR_NETWORK     | `testnet` or `mainnet`       | testnet |
| STELLAR_HORIZON_URL | Stellar Horizon RPC URL      | -       |

## Running Tests

```bash
# Backend tests
cd apps/backend
npm run test

# Contract tests
cd apps/contracts
cargo test
```

## Project Structure

### Backend (apps/backend)

```
src/
├── auth/           # JWT + Stellar wallet auth
├── invoice/        # Invoice management
├── financing/      # Financing offers
├── transaction/    # Blockchain transactions
├── user/           # User profiles
└── common/         # Shared utilities
```

### Contracts (apps/contracts)

```
vaultlink-core/
├── src/
│   ├── invoice.rs   # Invoice NFT contract
│   ├── financing.rs # Financing pool contract
│   ├── storage.rs   # Contract storage
│   └── lib.rs       # Contract entry point
└── Cargo.toml
```

## License

MIT
