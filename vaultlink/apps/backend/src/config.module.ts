import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration'; // Assumes configuration.ts is moved to src/

@Module({
  imports: [
    NestConfigModule.forRoot({ load: [configuration], isGlobal: true }),
  ],
})
export class ConfigModule {}