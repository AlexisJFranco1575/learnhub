import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CoursesService } from './courses.service';

const student: AuthUser = { id: 'student-1', email: 's@mail.com', role: Role.STUDENT };
const owner: AuthUser = { id: 'instructor-1', email: 'i1@mail.com', role: Role.INSTRUCTOR };
const otherInstructor: AuthUser = { id: 'instructor-2', email: 'i2@mail.com', role: Role.INSTRUCTOR };
const admin: AuthUser = { id: 'admin-1', email: 'a@mail.com', role: Role.ADMIN };

describe('CoursesService', () => {
  let service: CoursesService;
  let prisma: {
    course: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      course: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CoursesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(CoursesService);
  });

  describe('findAll', () => {
    it('only lists published courses for students', async () => {
      await service.findAll(student, { page: 2, limit: 10 });

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ published: true }, {}] },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('does not restrict admins and returns pagination metadata', async () => {
      prisma.course.count.mockResolvedValue(25);

      const result = await service.findAll(admin, { page: 1, limit: 10 });

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{}, {}] } }),
      );
      expect(result.meta).toEqual({ total: 25, page: 1, limit: 10, totalPages: 3 });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the course is not visible to the user', async () => {
      prisma.course.findFirst.mockResolvedValue(null);

      await expect(service.findOne(student, 'c1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('assigns the authenticated user as the instructor', async () => {
      prisma.course.create.mockResolvedValue({ id: 'c1' });

      await service.create(owner, { title: 'T', description: 'D' });

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            title: 'T',
            description: 'D',
            published: false,
            instructorId: 'instructor-1',
          },
        }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the course does not exist', async () => {
      prisma.course.findUnique.mockResolvedValue(null);

      await expect(
        service.update(owner, 'missing', { title: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('forbids an instructor from editing a course they do not own', async () => {
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        instructorId: 'instructor-1',
      });

      await expect(
        service.update(otherInstructor, 'c1', { title: 'hijack' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.course.update).not.toHaveBeenCalled();
    });

    it('allows an admin to edit any course', async () => {
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        instructorId: 'instructor-1',
      });
      prisma.course.update.mockResolvedValue({ id: 'c1' });

      await service.update(admin, 'c1', { title: 'New title' });

      expect(prisma.course.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1' } }),
      );
    });
  });

  describe('remove', () => {
    it('lets the owner delete their course', async () => {
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        instructorId: 'instructor-1',
      });
      prisma.course.delete.mockResolvedValue({});

      await service.remove(owner, 'c1');

      expect(prisma.course.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });
});