"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheTTL = void 0;
const common_1 = require("@nestjs/common");
const cache_constants_1 = require("../cache.constants");
const CacheTTL = (ttl) => (0, common_1.SetMetadata)(cache_constants_1.CACHE_TTL_METADATA, ttl);
exports.CacheTTL = CacheTTL;
