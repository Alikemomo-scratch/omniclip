import {
  IsString,
  IsOptional,
  IsIn,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsBooleanString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateDigestDto {
  @IsString()
  @IsIn(['daily', 'weekly'])
  digest_type!: string;

  @IsDateString()
  period_start!: string;

  @IsDateString()
  period_end!: string;
}

export class DigestQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  @IsIn(['daily', 'weekly'])
  type?: string;

  @IsOptional()
  @IsBooleanString()
  archived?: string;
}
