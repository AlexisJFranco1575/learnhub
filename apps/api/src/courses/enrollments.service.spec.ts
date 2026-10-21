import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentsService } from './enrollments.service';

const student: AuthUser = { id: 'student-1', email: 's@mail.com', role: Role.STUDENT };
const otherInstructor: AuthUser = { id: 'instructor-2', email: 'i2@mail.com', role: Role.INSTRUCTOR };

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  let prisma: {
    course: { findUnique: jest.Mock };
    enrollment: {
      create: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      course: { findUnique: jest.fn() },
      enrollment: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(EnrollmentsService);
  });

  it('hides unpublished courses from enrollment (NotFound)', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', published: false });

    await expect(service.enroll(student, 'c1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.enrollment.create).not.toHaveBeenCalled();
  });

  it('throws ConflictException when already enrolled', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', published: true });
    prisma.enrollment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.enroll(student, 'c1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('enrolls a student in a published course', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', published: true });
    prisma.enrollment.create.mockResolvedValue({ id: 'e1', courseId: 'c1' });

    const result = await service.enroll(student, 'c1');

    expect(prisma.enrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'student-1', courseId: 'c1' } }),
    );
    expect(result).toEqual({ id: 'e1', courseId: 'c1' });
  });

  it('throws NotFoundException when unenrolling without an enrollment', async () => {
    prisma.enrollment.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.unenroll(student, 'c1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('forbids listing students of a course owned by someone else', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 'c1',
      instructorId: 'instructor-1',
    });

    await expect(
      service.listStudents(otherInstructor, 'c1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });
});