import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './common/config';
import { DatabaseModule } from './common/database';
import { AuthModule } from './auth';
import { UsersModule } from './users';
import { SyncModule } from './sync';
import { ConnectorsModule } from './connectors';
import { ConnectionsModule } from './connections';
import { ContentModule } from './content';
import { DigestModule } from './digest';
import { LoggerModule } from './common/logger/logger.module';
import { LoggerMiddleware } from './common/logger/logger.middleware';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig],
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    SyncModule,
    ConnectorsModule,
    ConnectionsModule,
    ContentModule,
    DigestModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware, RateLimitMiddleware).forRoutes('*');
  }
}
