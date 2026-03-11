import { IsString, IsOptional, IsInt, Min, Max, MaxLength, IsIn, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  display_name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['zh', 'en'])
  preferred_language?: string;

  @IsOptional()
  @IsString()
  @IsIn(['daily', 'weekly'])
  digest_frequency?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'digest_time must be in HH:MM format' })
  digest_time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(365)
  content_retention_days?: number;
}
