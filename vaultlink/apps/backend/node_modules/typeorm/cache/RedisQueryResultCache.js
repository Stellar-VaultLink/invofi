"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisQueryResultCache = void 0;
const PlatformTools_1 = require("../platform/PlatformTools");
const TypeORMError_1 = require("../error/TypeORMError");
/**
 * Caches query result into Redis database.
 */
class RedisQueryResultCache {
    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------
    constructor(connection, clientType) {
        this.connection = connection;
        /**
         * Whether the Redis client uses Promise-based API (v5+) or callback-based API (v3/v4).
         * Detected at runtime after connection.
         */
        this.isPromiseBasedApi = false;
        this.clientType = clientType;
        this.redis = this.loadRedis();
    }
    // -------------------------------------------------------------------------
    // Public Methods
    // -------------------------------------------------------------------------
    /**
     * Creates a connection with given cache provider.
     */
    async connect() {
        const cacheOptions = this.connection.options.cache;
        if (this.clientType === "redis") {
            const clientOptions = {
                ...cacheOptions?.options,
            };
            // Create initial client to test Redis version
            let tempClient = this.redis.createClient(clientOptions);
            const isRedis4Plus = typeof tempClient.connect === "function";
            if (isRedis4Plus) {
                // Redis 4+ detected, recreate with legacyMode for Redis 4.x
                // (Redis 5 will ignore legacyMode if not needed)
                clientOptions.legacyMode = true;
                tempClient = this.redis.createClient(clientOptions);
            }
            // Set as the main client
            this.client = tempClient;
            if (typeof this.connection.options.cache === "object" &&
                this.connection.options.cache.ignoreErrors) {
                this.client.on("error", (err) => {
                    this.connection.logger.log("warn", err);
                });
            }
            // Connect if Redis 4+
            if (typeof this.client.connect === "function") {
                await this.client.connect();
            }
            // Detect API style by checking if methods return Promises
            this.detectPromiseBasedApi();
        }
        else if (this.clientType === "ioredis") {
            if (cacheOptions && cacheOptions.port) {
                if (cacheOptions.options) {
                    this.client = new this.redis(cacheOptions.port, cacheOptions.options);
                }
                else {
                    this.client = new this.redis(cacheOptions.port);
                }
            }
            else if (cacheOptions && cacheOptions.options) {
                this.client = new this.redis(cacheOptions.options);
            }
            else {
                this.client = new this.redis();
            }
        }
        else if (this.clientType === "ioredis/cluster") {
            if (cacheOptions &&
                cacheOptions.options &&
                Array.isArray(cacheOptions.options)) {
                this.client = new this.redis.Cluster(cacheOptions.options);
            }
            else if (cacheOptions &&
                cacheOptions.options &&
                cacheOptions.options.startupNodes) {
                this.client = new this.redis.Cluster(cacheOptions.options.startupNodes, cacheOptions.options.options);
            }
            else {
                throw new TypeORMError_1.TypeORMError(`options.startupNodes required for ${this.clientType}.`);
            }
        }
    }
    /**
     * Disconnects the connection
     */
    async disconnect() {
        if (this.isPromiseBasedApi) {
            await this.client.quit();
            this.client = undefined;
            return;
        }
        return new Promise((ok, fail) => {
            this.client.quit((err, result) => {
                if (err)
                    return fail(err);
                ok();
                this.client = undefined;
            });
        });
    }
    /**
     * Creates table for storing cache if it does not exist yet.
     */
    async synchronize(queryRunner) { }
    /**
     * Get data from cache.
     * Returns cache result if found.
     * Returns undefined if result is not cached.
     */
    getFromCache(options, queryRunner) {
        const key = options.identifier || options.query;
        if (!key)
            return Promise.resolve(undefined);
        if (this.isPromiseBasedApi) {
            return this.client.get(key).then((result) => {
                return result ? JSON.parse(result) : undefined;
            });
        }
        return new Promise((ok, fail) => {
            this.client.get(key, (err, result) => {
                if (err)
                    return fail(err);
                ok(result ? JSON.parse(result) : undefined);
            });
        });
    }
    /**
     * Checks if cache is expired or not.
     */
    isExpired(savedCache) {
        return savedCache.time + savedCache.duration < Date.now();
    }
    /**
     * Stores given query result in the cache.
     */
    async storeInCache(options, savedCache, queryRunner) {
        const key = options.identifier || options.query;
        if (!key)
            return;
        const value = JSON.stringify(options);
        const duration = options.duration;
        if (this.isPromiseBasedApi) {
            await this.client.set(key, value, {
                PX: duration,
            });
            return;
        }
        return new Promise((ok, fail) => {
            this.client.set(key, value, "PX", duration, (err, result) => {
                if (err)
                    return fail(err);
                ok();
            });
        });
    }
    /**
     * Clears everything stored in the cache.
     */
    async clear(queryRunner) {
        if (this.isPromiseBasedApi) {
            await this.client.flushDb();
            return;
        }
        return new Promise((ok, fail) => {
            this.client.flushdb((err, result) => {
                if (err)
                    return fail(err);
                ok();
            });
        });
    }
    /**
     * Removes all cached results by given identifiers from cache.
     */
    async remove(identifiers, queryRunner) {
        await Promise.all(identifiers.map((identifier) => {
            return this.deleteKey(identifier);
        }));
    }
    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------
    /**
     * Removes a single key from redis database.
     */
    async deleteKey(key) {
        if (this.isPromiseBasedApi) {
            await this.client.del(key);
            return;
        }
        return new Promise((ok, fail) => {
            this.client.del(key, (err, result) => {
                if (err)
                    return fail(err);
                ok();
            });
        });
    }
    /**
     * Loads redis dependency.
     */
    loadRedis() {
        try {
            if (this.clientType === "ioredis/cluster") {
                return PlatformTools_1.PlatformTools.load("ioredis");
            }
            else {
                return PlatformTools_1.PlatformTools.load(this.clientType);
            }
        }
        catch {
            throw new TypeORMError_1.TypeORMError(`Cannot use cache because ${this.clientType} is not installed. Please run "npm i ${this.clientType}".`);
        }
    }
    /**
     * Detects whether the Redis client uses Promise-based API (v5+) or callback-based API (v3/v4)
     * by checking the return type of a method call at runtime.
     */
    detectPromiseBasedApi() {
        // Call ping() and check if it returns a Promise
        // This works because v5+ returns Promises directly, while v4 with legacyMode uses callbacks
        const result = this.client.ping();
        this.isPromiseBasedApi = !!result?.then;
        if (this.isPromiseBasedApi) {
            result.catch(() => { });
        }
    }
}
exports.RedisQueryResultCache = RedisQueryResultCache;

//# sourceMappingURL=RedisQueryResultCache.js.map
