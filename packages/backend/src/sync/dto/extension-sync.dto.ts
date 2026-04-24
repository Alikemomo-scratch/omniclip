import {
  IsString,
  IsEnum,
  IsUUID,
  IsArray,
  IsOptional,
  IsObject,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * A single content item in an extension sync payload.
 */
export class ExtensionSyncItemDto {
  @IsString()
  external_id!: string;

  @IsString()
  content_type!: string;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsArray()
  media_urls?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  author_name?: string | null;

  @IsOptional()
  @IsString()
  author_url?: string | null;

  @IsString()
  original_url!: string;

  @IsOptional()
  @IsString()
  published_at?: string;
}

/**
 * Sync metadata from the extension.
 */
export class SyncMetadataDto {
  @IsOptional()
  @IsString()
  collected_at?: string;

  @IsOptional()
  items_in_buffer?: number;

  @IsOptional()
  @IsString()
  extension_version?: string;
}

/**
 * POST /api/v1/sync/extension — batch upload from extension.
 */
export class ExtensionSyncDto {
  @IsEnum(['twitter'])
  platform!: string;

  @IsUUID()
  connection_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ExtensionSyncItemDto)
  items!: ExtensionSyncItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SyncMetadataDto)
  sync_metadata?: SyncMetadataDto;
}

/**
 * POST /api/v1/sync/heartbeat — extension health report.
 */
export class HeartbeatDto {
  @IsUUID()
  connection_id!: string;

  @IsEnum(['twitter'])
  platform!: string;

  @IsEnum(['active', 'error', 'disconnected'])
  status!: string;

  @IsOptional()
  @IsString()
  last_collection_at?: string;

  @IsOptional()
  items_buffered?: number;

  @IsOptional()
  @IsArray()
  errors?: string[];

  @IsOptional()
  @IsString()
  error_type?: string;

  @IsOptional()
  @IsString()
  error_message?: string;
}
