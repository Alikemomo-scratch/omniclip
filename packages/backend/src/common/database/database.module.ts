import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as path from 'path';
import { DRIZZLE } from './database.constants';
import * as schema from './schema';

const logger = new Logger('DatabaseModule');

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<NodePgDatabase<typeof schema>> => {
        const pool = new Pool({
          connectionString: config.get<string>('database.url'),
          max: 20,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        });

        const db = drizzle(pool, { schema });

        if (process.env.NODE_ENV !== 'test') {
          const migrationsFolder = path.join(__dirname, '..', '..', '..', 'drizzle');
          logger.log('Running database migrations...');
          await migrate(db, { migrationsFolder });
          logger.log('Database migrations completed');
        }

        return db;
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
