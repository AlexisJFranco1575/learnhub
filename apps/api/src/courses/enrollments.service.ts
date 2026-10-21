import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanManage } from './course-access';

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async enroll(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    // Unpublished courses are invisible to students: same answer as "missing".
    if (!course || !course.published) {
      throw new NotFoundException('Course not found');
    }

    try {
      return await this.prisma.enrollment.create({
        data: { userId: user.id, courseId },
        select: { id: true, courseId: true, enrolledAt: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You are already enrolled in this course');
      }
      throw error;
    }
  }

  async unenroll(user: AuthUser, courseId: string): Promise<void> {
    const result = await this.prisma.enrollment.deleteMany({
      where: { userId: user.id, courseId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Enrollment not found');
    }
  }

  async listStudents(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    assertCanManage(user, course);

    return this.prisma.enrollment.findMany({
      where: { courseId },
      select: {
        id: true,
        enrolledAt: true,
        user: { select: { id: true, email: true, fullName: true } },
      },
      orderBy: { enrolledAt: 'asc' },
    });
  }

  listMine(user: AuthUser) {
    return this.prisma.enrollment.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        enrolledAt: true,
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            instructor: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }
}