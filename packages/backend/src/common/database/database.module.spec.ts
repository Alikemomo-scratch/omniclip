import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule, DRIZZLE } from './index';
import { appConfig } from '../config';

describe('DatabaseModule', () => {
  it('should provide DRIZZLE token when configured', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [appConfig],
        }),
        DatabaseModule,
      ],
    }).compile();

    const db = module.get(DRIZZLE);
    expect(db).toBeDefined();
    expect(db).toHaveProperty('query');
    expect(db).toHaveProperty('select');
    expect(db).toHaveProperty('insert');
    expect(db).toHaveProperty('update');
    expect(db).toHaveProperty('delete');
    expect(db).toHaveProperty('transaction');

    await module.close();
  });
});
