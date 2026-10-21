import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanManage } from './course-access';
import { CreateCourseDto } from './dto/create-course.dto';
import { ListCoursesQuery } from './dto/list-courses.query';
import { UpdateCourseDto } from './dto/update-course.dto';

const courseInclude = {
  instructor: { select: { id: true, fullName: true } },
  _count: { select: { enrollments: true } },
} satisfies Prisma.CourseInclude;

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: ListCoursesQuery) {
    const { page, limit, search } = query;
    const where: Prisma.CourseWhereInput = {
      AND: [
        this.visibilityFilter(user),
        search ? { title: { contains: search, mode: 'insensitive' } } : {},
      ],
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        include: courseInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.course.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(user: AuthUser, id: string) {
    const course = await this.prisma.course.findFirst({
      where: { AND: [{ id }, this.visibilityFilter(user)] },
      include: courseInclude,
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  create(user: AuthUser, dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: {
        title: dto.title,
        description: dto.description,
        published: dto.published ?? false,
        instructorId: user.id,
      },
      include: courseInclude,
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateCourseDto) {
    const course = await this.getOrThrow(id);
    assertCanManage(user, course);

    return this.prisma.course.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        published: dto.published,
      },
      include: courseInclude,
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const course = await this.getOrThrow(id);
    assertCanManage(user, course);
    await this.prisma.course.delete({ where: { id } });
  }

  private async getOrThrow(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  // Who can SEE which courses (read access), enforced in the query itself.
  private visibilityFilter(user: AuthUser): Prisma.CourseWhereInput {
    if (user.role === Role.ADMIN) {
      return {};
    }
    if (user.role === Role.INSTRUCTOR) {
      return { OR: [{ published: true }, { instructorId: user.id }] };
    }
    return { published: true };
  }
}