import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './common/config';
import { DatabaseModule } from './common/database';
import { AuthModule } from './auth';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig],
    }),
    DatabaseModule,
    AuthModule,
  ],
})
export class AppModule {}
