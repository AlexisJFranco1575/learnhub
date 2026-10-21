import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const actor: AuthUser = { id: 'admin-1', email: 'admin@mail.com', role: Role.ADMIN };

describe('UsersService.updateRole', () => {
  let service: UsersService;
  let prisma: { user: { update: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { update: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('prevents an admin from changing their own role', async () => {
    await expect(
      service.updateRole(actor, 'admin-1', Role.STUDENT),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the target user does not exist', async () => {
    prisma.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.updateRole(actor, 'ghost', Role.INSTRUCTOR),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates the role of another user', async () => {
    prisma.user.update.mockResolvedValue({ id: 'user-2', role: Role.INSTRUCTOR });

    await service.updateRole(actor, 'user-2', Role.INSTRUCTOR);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-2' },
        data: { role: Role.INSTRUCTOR },
      }),
    );
  });
});