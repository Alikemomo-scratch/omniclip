import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

import { DIGEST_QUEUE_NAME } from './digest.constants';
import { DigestService } from './digest.service';
import { DigestController } from './digest.controller';
import { DigestScheduler } from './digest.scheduler';
import { DigestProcessor } from './digest.processor';
import { UsersModule } from '../users';

@Module({
  imports: [
    BullModule.registerQueue({
      name: DIGEST_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    }),
    BullBoardModule.forFeature({
      name: DIGEST_QUEUE_NAME,
      adapter: BullMQAdapter,
    }),
    UsersModule,
  ],
  controllers: [DigestController],
  providers: [DigestService, DigestScheduler, DigestProcessor],
  exports: [DigestService],
})
export class DigestModule {}
