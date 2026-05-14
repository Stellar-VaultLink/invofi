import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from './config.module'; // Import your custom ConfigModule
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { InvoiceModule } from './invoice/invoice.module';
import { FinancingModule } from './financing/financing.module';
import { TransactionModule } from './transaction/transaction.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    ConfigModule, // Use your custom ConfigModule which loads configuration.ts and is global
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ...configService.get('database'),
        autoLoadEntities: true,
      }),
    }),
    CacheModule.registerAsync<any>({ // Explicitly type CacheModule.registerAsync
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({ // Make useFactory async
        store: await redisStore({ // Call redisStore with config
          socket: {
            host: configService.get<string>('redis.host'),
            port: configService.get<number>('redis.port'),
          },
          ttl: 30,
        }) as any, // Type assertion for the store
      }), // Removed extra parentheses
      isGlobal: true,
    }),
    AuthModule,
    UserModule,
    InvoiceModule,
    FinancingModule,
    TransactionModule,
    CommonModule,
  ],
})
export class AppModule {}