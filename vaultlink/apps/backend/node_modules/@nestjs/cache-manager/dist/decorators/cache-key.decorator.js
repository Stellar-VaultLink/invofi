"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheKey = void 0;
const common_1 = require("@nestjs/common");
const cache_constants_1 = require("../cache.constants");
/**
 * Decorator that sets the caching key used to store/retrieve cached items for
 * Web sockets or Microservice based apps.
 *
 * For example:
 * `@CacheKey('events')`
 *
 * @param key string naming the field to be used as a cache key
 *
 * @see [Caching](https://docs.nestjs.com/techniques/caching)
 *
 * @publicApi
 */
const CacheKey = (key) => (0, common_1.SetMetadata)(cache_constants_1.CACHE_KEY_METADATA, key);
exports.CacheKey = CacheKey;
