import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { RetentionScheduler } from './retention.scheduler';
import { RetentionProcessor } from './retention.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'retention' })],
  controllers: [ContentController],
  providers: [ContentService, RetentionScheduler, RetentionProcessor],
  exports: [ContentService],
})
export class ContentModule {}
