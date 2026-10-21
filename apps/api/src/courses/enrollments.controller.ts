import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { EnrollmentsService } from './enrollments.service';

@ApiTags('enrollments')
@ApiBearerAuth()
@Controller()
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @ApiOperation({ summary: 'Enroll in a published course (STUDENT)' })
  @Roles(Role.STUDENT)
  @Post('courses/:id/enroll')
  enroll(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.enrollments.enroll(user, id);
  }

  @ApiOperation({ summary: 'Leave a course (STUDENT)' })
  @Roles(Role.STUDENT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('courses/:id/enroll')
  async unenroll(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.enrollments.unenroll(user, id);
  }

  @ApiOperation({ summary: 'List students of a course (owner or ADMIN)' })
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('courses/:id/students')
  listStudents(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.enrollments.listStudents(user, id);
  }

  @ApiOperation({ summary: 'List my enrollments (STUDENT)' })
  @Roles(Role.STUDENT)
  @Get('enrollments/me')
  listMine(@CurrentUser() user: AuthUser) {
    return this.enrollments.listMine(user);
  }
}