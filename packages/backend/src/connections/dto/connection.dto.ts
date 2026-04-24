import { IsString, IsEnum, IsOptional, IsInt, Min, Max, IsObject } from 'class-validator';

export class CreateConnectionDto {
  @IsEnum(['github', 'youtube', 'twitter'])
  platform!: string;

  @IsEnum(['api', 'cookie', 'extension'])
  connection_type!: string;

  @IsOptional()
  @IsObject()
  auth_data?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(43200)
  sync_interval_minutes?: number;
}

export class UpdateConnectionDto {
  @IsOptional()
  @IsObject()
  auth_data?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(43200)
  sync_interval_minutes?: number;
}
