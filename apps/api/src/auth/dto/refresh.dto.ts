import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token received at login or last refresh' })
  @IsJWT()
  refreshToken!: string;
}