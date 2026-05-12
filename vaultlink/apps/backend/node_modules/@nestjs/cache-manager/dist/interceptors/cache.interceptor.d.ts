import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { HttpAdapterHost, Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
/**
 * @see [Caching](https://docs.nestjs.com/techniques/caching)
 *
 * @publicApi
 */
export declare class CacheInterceptor implements NestInterceptor {
    protected readonly cacheManager: any;
    protected readonly reflector: Reflector;
    protected readonly httpAdapterHost: HttpAdapterHost;
    protected allowedMethods: string[];
    private cacheManagerIsv5OrGreater;
    constructor(cacheManager: any, reflector: Reflector);
    intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>>;
    protected trackBy(context: ExecutionContext): string | undefined;
    protected isRequestCacheable(context: ExecutionContext): boolean;
    protected setHeadersWhenHttp(context: ExecutionContext, value: any): void;
}
