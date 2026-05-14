"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        port: parseInt(process.env.DATABASE_PORT || '5432', 10),
        username: process.env.POSTGRES_USER || 'vaultlink',
        password: process.env.POSTGRES_PASSWORD || 'vaultlink123',
        database: process.env.POSTGRES_DB || 'vaultlink',
        synchronize: process.env.NODE_ENV !== 'production',
        logging: process.env.NODE_ENV !== 'production',
        retryAttempts: 10,
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production',
        expiresIn: '1h',
    },
    stellar: {
        network: process.env.STELLAR_NETWORK || 'testnet',
        horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
    }
});
//# sourceMappingURL=configuration.js.map