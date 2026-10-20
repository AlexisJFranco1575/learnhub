import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const ENV: Record<string, string> = {
  JWT_ACCESS_SECRET: 'access-secret-access-secret-access-1',
  JWT_REFRESH_SECRET: 'refresh-secret-refresh-secret-refre-1',
  JWT_ACCESS_TTL_SECONDS: '900',
  JWT_REFRESH_TTL_SECONDS: '604800',
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
      verifyAsync: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { getOrThrow: (key: string) => ENV[key] },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('stores a normalized email and an argon2 hash, never the plain password', async () => {
      prisma.user.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'user-1',
          role: Role.STUDENT,
          ...data,
        }),
      );

      const tokens = await service.register({
        email: 'Test@Mail.com',
        password: 'Passw0rd!123',
        fullName: 'Test User',
      });

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.email).toBe('test@mail.com');
      expect(data.passwordHash).not.toBe('Passw0rd!123');
      expect(data.passwordHash).toMatch(/^\$argon2/);
      expect(tokens).toEqual({
        accessToken: 'signed.jwt.token',
        refreshToken: 'signed.jwt.token',
      });
    });

    it('throws ConflictException when the email already exists', async () => {
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.register({
          email: 'dup@mail.com',
          password: 'Passw0rd!123',
          fullName: 'Dup User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@mail.com', password: 'whatever123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@mail.com',
        role: Role.STUDENT,
        passwordHash: await argon2.hash('correct-password'),
      });

      await expect(
        service.login({ email: 'a@mail.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns tokens and stores a hashed refresh token on success', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@mail.com',
        role: Role.STUDENT,
        passwordHash: await argon2.hash('correct-password'),
      });

      const tokens = await service.login({
        email: 'a@mail.com',
        password: 'correct-password',
      });

      expect(tokens.accessToken).toBe('signed.jwt.token');
      const updateArg = prisma.user.update.mock.calls[0][0];
      expect(updateArg.data.refreshTokenHash).toMatch(/^\$argon2/);
    });
  });

  describe('refresh', () => {
    it('rejects an invalid token signature', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(service.refresh('bad.token.value')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('revokes the session when an outdated refresh token is reused', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@mail.com',
        role: Role.STUDENT,
        refreshTokenHash: await argon2.hash('the-current-token'),
      });

      await expect(service.refresh('an-old-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshTokenHash: null },
      });
    });
  });
});