import { ExecutionContext } from '@nestjs/common';
/**
 * Decorator that sets the cache ttl setting the duration for cache expiration.
 *
 * For example: `@CacheTTL(5)`
 *
 * @param ttl number set the cache expiration time
 *
 * @see [Caching](https://docs.nestjs.com/techniques/caching)
 *
 * @publicApi
 */
type CacheTTLFactory = (ctx: ExecutionContext) => Promise<number> | number;
export declare const CacheTTL: (ttl: number | CacheTTLFactory) => import("@nestjs/common").CustomDecorator<string>;
export {};
