import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { SYNC_QUEUE_NAME } from './sync.constants';
import { SyncProcessor } from './sync.processor';
import { ConnectionsModule } from '../connections';
import { ContentModule } from '../content';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('redis.url'),
        },
      }),
    }),
    BullModule.registerQueue({
      name: SYNC_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    }),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: SYNC_QUEUE_NAME,
      adapter: BullMQAdapter,
    }),
    ConnectionsModule,
    ContentModule,
  ],
  providers: [SyncProcessor],
  exports: [BullModule],
})
export class SyncModule {}
