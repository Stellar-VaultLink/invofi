# VaultLink

A decentralized invoice financing protocol built on Stellar Soroban.

## Overview

VaultLink enables businesses to tokenize invoices as NFTs on Stellar and obtain immediate financing from investors. The protocol consists of:

- **Backend**: NestJS API with JWT authentication and Stellar wallet signature verification
- **Smart Contracts**: Soroban Rust contracts for invoice NFTs and financing pools
- **Database**: PostgreSQL with TypeORM for data persistence
- **Cache**: Redis for session management and caching

## Architecture

```md
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

### 1. Environment Configuration

The backend application expects its environment variables in the `apps/backend/` directory.

```bash
cd vault-link
cp .env.example apps/backend/.env
```

Ensure your `apps/backend/.env` contains the correct connection strings for your local environment (e.g., using `localhost:5432` for the database if running the app on your host machine).

### 2. Start Infrastructure (Docker)

VaultLink uses Docker Compose to manage PostgreSQL and Redis. From the project root, run:

```bash
docker-compose up -d
```

Verify that both services are healthy:

```bash
docker ps
```

### 3. Start the Backend API

Navigate to the backend directory, install dependencies, and start the development server:

```bash
cd apps/backend
npm install
npm run start:dev
```

The server will start at `http://localhost:3000`.

### 4. Interactive API Documentation

Once the application is running, you can explore and test the API endpoints (Registration, Login, Invoice creation, etc.) via the [Swagger UI](http://localhost:3000/api)

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

| Variable            | Description                                  | Default                                 |
| ------------------- | -------------------------------------------- | --------------------------------------- |
| DATABASE_URL        | PostgreSQL connection string                 | -                                       |
| REDIS_HOST          | Redis server host                            | `localhost`                             |
| REDIS_PORT          | Redis server port                            | `6379`                                  |
| JWT_SECRET          | Secret for JWT signing                       | -                                       |
| STELLAR_NETWORK     | `testnet` or `public`                        | `testnet`                               |
| STELLAR_HORIZON_URL | Stellar Horizon RPC URL                      | `https://horizon-testnet.stellar.org`   |
| CONTRACT_ID         | Deployed Soroban Contract ID                 | -                                       |

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

```md
src/
├── auth/           # JWT + Stellar wallet auth
├── invoice/        # Invoice management
├── financing/      # Financing offers
├── transaction/    # Blockchain transactions
├── user/           # User profiles
└── common/         # Shared utilities
```

### Contracts (apps/contracts)

```md
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
