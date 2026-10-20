import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth.types';
import { RolesGuard } from './roles.guard';

function buildContext(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows access when the route requires no specific role', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('allows a user whose role is in the required list', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const admin: AuthUser = { id: '1', email: 'a@mail.com', role: Role.ADMIN };

    expect(guard.canActivate(buildContext(admin))).toBe(true);
  });

  it('forbids a user whose role is not in the required list', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const student: AuthUser = { id: '2', email: 's@mail.com', role: Role.STUDENT };

    expect(() => guard.canActivate(buildContext(student))).toThrow(
      ForbiddenException,
    );
  });
});