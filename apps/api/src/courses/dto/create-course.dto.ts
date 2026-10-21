import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCourseDto {
  @ApiProperty({ example: 'NestJS Fundamentals', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @ApiProperty({ example: 'Build production-ready APIs with NestJS.', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ default: false, description: 'Only published courses are visible to students' })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}