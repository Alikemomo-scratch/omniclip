import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../common/database/database.constants';
import type { DrizzleDB } from '../common/database/rls.middleware';
import { withRlsContext } from '../common/database/rls.middleware';
import { users } from '../common/database/schema';
import type { UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findById(userId: string) {
    return withRlsContext(this.db, userId, async (tx) => {
      const [user] = await tx
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          preferredLanguage: users.preferredLanguage,
          digestFrequency: users.digestFrequency,
          digestTime: users.digestTime,
          timezone: users.timezone,
          contentRetentionDays: users.contentRetentionDays,
          digestPrompt: users.digestPrompt,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return this.formatUser(user);
    });
  }

  async update(userId: string, dto: UpdateUserDto) {
    return withRlsContext(this.db, userId, async (tx) => {
      const updateData: Record<string, unknown> = {};

      if (dto.display_name !== undefined) updateData.displayName = dto.display_name;
      if (dto.preferred_language !== undefined)
        updateData.preferredLanguage = dto.preferred_language;
      if (dto.digest_frequency !== undefined) updateData.digestFrequency = dto.digest_frequency;
      if (dto.digest_time !== undefined) updateData.digestTime = dto.digest_time;
      if (dto.timezone !== undefined) updateData.timezone = dto.timezone;
      if (dto.content_retention_days !== undefined)
        updateData.contentRetentionDays = dto.content_retention_days;
      if (dto.digest_prompt !== undefined) updateData.digestPrompt = dto.digest_prompt ?? null;

      if (Object.keys(updateData).length === 0) {
        return this.findByIdInTx(tx, userId);
      }

      updateData.updatedAt = new Date();

      const [user] = await tx.update(users).set(updateData).where(eq(users.id, userId)).returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        preferredLanguage: users.preferredLanguage,
        digestFrequency: users.digestFrequency,
        digestTime: users.digestTime,
        timezone: users.timezone,
        contentRetentionDays: users.contentRetentionDays,
        digestPrompt: users.digestPrompt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return this.formatUser(user);
    });
  }

  /**
   * Find user by ID within an existing RLS-scoped transaction.
   * Used internally when we're already inside withRlsContext.
   */
  private async findByIdInTx(tx: DrizzleDB, userId: string) {
    const [user] = await tx
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        preferredLanguage: users.preferredLanguage,
        digestFrequency: users.digestFrequency,
        digestTime: users.digestTime,
        timezone: users.timezone,
        contentRetentionDays: users.contentRetentionDays,
        digestPrompt: users.digestPrompt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.formatUser(user);
  }

  private formatUser(user: {
    id: string;
    email: string;
    displayName: string;
    preferredLanguage: string;
    digestFrequency: string;
    digestTime: string;
    timezone: string;
    contentRetentionDays: number;
    digestPrompt: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      preferred_language: user.preferredLanguage,
      digest_frequency: user.digestFrequency,
      digest_time: user.digestTime,
      timezone: user.timezone,
      content_retention_days: user.contentRetentionDays,
      digest_prompt: user.digestPrompt,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  }
}
