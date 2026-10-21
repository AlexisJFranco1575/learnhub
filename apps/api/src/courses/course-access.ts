import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';

/** Admins can manage any course; instructors only their own. */
export function assertCanManage(
  user: AuthUser,
  course: { instructorId: string },
): void {
  if (user.role !== Role.ADMIN && course.instructorId !== user.id) {
    throw new ForbiddenException('You can only manage your own courses');
  }
}