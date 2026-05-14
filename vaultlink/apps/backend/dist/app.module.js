"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const config_module_1 = require("./config.module");
const cache_manager_1 = require("@nestjs/cache-manager");
const cache_manager_redis_store_1 = require("cache-manager-redis-store");
const auth_module_1 = require("./auth/auth.module");
const user_module_1 = require("./user/user.module");
const invoice_module_1 = require("./invoice/invoice.module");
const financing_module_1 = require("./financing/financing.module");
const transaction_module_1 = require("./transaction/transaction.module");
const common_module_1 = require("./common/common.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_module_1.ConfigModule,
            typeorm_1.TypeOrmModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    ...configService.get('database'),
                    autoLoadEntities: true,
                }),
            }),
            cache_manager_1.CacheModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: async (configService) => ({
                    store: await (0, cache_manager_redis_store_1.redisStore)({
                        socket: {
                            host: configService.get('redis.host'),
                            port: configService.get('redis.port'),
                        },
                        ttl: 30,
                    }),
                }),
                isGlobal: true,
            }),
            auth_module_1.AuthModule,
            user_module_1.UserModule,
            invoice_module_1.InvoiceModule,
            financing_module_1.FinancingModule,
            transaction_module_1.TransactionModule,
            common_module_1.CommonModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map