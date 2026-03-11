import { IsString, IsEnum, IsOptional, IsInt, Min, Max, IsObject } from 'class-validator';

export class CreateConnectionDto {
  @IsEnum(['github', 'youtube', 'twitter', 'xiaohongshu'])
  platform!: string;

  @IsEnum(['api', 'extension'])
  connection_type!: string;

  @IsOptional()
  @IsObject()
  auth_data?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  sync_interval_minutes?: number;
}

export class UpdateConnectionDto {
  @IsOptional()
  @IsObject()
  auth_data?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  sync_interval_minutes?: number;
}
