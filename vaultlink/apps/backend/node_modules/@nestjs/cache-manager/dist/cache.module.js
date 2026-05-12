"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheModule = exports.Cache = void 0;
const common_1 = require("@nestjs/common");
const cache_constants_1 = require("./cache.constants");
const cache_module_definition_1 = require("./cache.module-definition");
const cache_providers_1 = require("./cache.providers");
/**
 * This is just the same as the `Cache` interface from `cache-manager` but you can
 * use this as a provider token as well.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class Cache {
}
exports.Cache = Cache;
/**
 * Module that provides Nest cache-manager.
 *
 * @see [Caching](https://docs.nestjs.com/techniques/caching)
 *
 * @publicApi
 */
let CacheModule = class CacheModule extends cache_module_definition_1.ConfigurableModuleClass {
    /**
     * Configure the cache manager statically.
     *
     * @param options options to configure the cache manager
     *
     * @see [Customize caching](https://docs.nestjs.com/techniques/caching#customize-caching)
     */
    static register(options = {}) {
        return {
            global: options.isGlobal,
            ...super.register(options),
        };
    }
    /**
     * Configure the cache manager dynamically.
     *
     * @param options method for dynamically supplying cache manager configuration
     * options
     *
     * @see [Async configuration](https://docs.nestjs.com/techniques/caching#async-configuration)
     */
    static registerAsync(options) {
        const moduleDefinition = super.registerAsync(options);
        return {
            global: options.isGlobal,
            ...moduleDefinition,
            providers: options.extraProviders
                ? moduleDefinition.providers.concat(options.extraProviders)
                : moduleDefinition.providers,
        };
    }
};
exports.CacheModule = CacheModule;
exports.CacheModule = CacheModule = __decorate([
    (0, common_1.Module)({
        providers: [
            (0, cache_providers_1.createCacheManager)(),
            {
                provide: Cache,
                useExisting: cache_constants_1.CACHE_MANAGER,
            }
        ],
        exports: [cache_constants_1.CACHE_MANAGER, Cache],
    })
], CacheModule);
