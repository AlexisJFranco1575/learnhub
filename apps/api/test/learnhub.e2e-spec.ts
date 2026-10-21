import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

// Every record created by this suite uses this prefix, so the suite cleans up
// after itself without ever touching real or seeded data.
const EMAIL_PREFIX = 'e2e-';
const RUN_ID = randomUUID().slice(0, 8);
const PASSWORD = 'E2ePassw0rd!123';

const emailOf = (label: string) =>
  `${EMAIL_PREFIX}${RUN_ID}-${label}@example.com`;

describe('LearnHub API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: Server;

  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  let publishedCourseId = '';
  let draftCourseId = '';

  const bearer = (label: string) => `Bearer ${tokens[label]}`;

  const searchCourses = (label: string, extraQuery = '') =>
    request(http)
      .get(`/api/courses?search=${RUN_ID}${extraQuery}`)
      .set('Authorization', bearer(label));

  async function cleanup(): Promise<void> {
    // Courses first: the instructor relation does not cascade.
    // Enrollments are removed by cascade from both sides.
    await prisma.course.deleteMany({
      where: { instructor: { email: { startsWith: EMAIL_PREFIX } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    http = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);

    // Remove leftovers from a previous run that crashed halfway.
    await cleanup();

    const passwordHash = await argon2.hash(PASSWORD);
    const accounts: Array<[string, Role]> = [
      ['admin', Role.ADMIN],
      ['owner', Role.INSTRUCTOR],
      ['other', Role.INSTRUCTOR],
      ['student', Role.STUDENT],
    ];

    for (const [label, role] of accounts) {
      const user = await prisma.user.create({
        data: {
          email: emailOf(label),
          fullName: `E2E ${label}`,
          role,
          passwordHash,
        },
      });
      ids[label] = user.id;

      const res = await request(http)
        .post('/api/auth/login')
        .send({ email: emailOf(label), password: PASSWORD })
        .expect(200);
      tokens[label] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    if (prisma) {
      await cleanup();
    }
    if (app) {
      await app.close();
    }
  });

  describe('health', () => {
    it('reports the API and the database as healthy', async () => {
      const res = await request(http).get('/api/health').expect(200);

      expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    });
  });

  describe('authentication', () => {
    const account = {
      email: emailOf('newuser'),
      password: PASSWORD,
      fullName: 'E2E New User',
    };
    let refreshToken = '';
    let previousRefreshToken = '';

    it('rejects protected requests without a token', async () => {
      await request(http).get('/api/users/me').expect(401);
    });

    it('registers a new account as STUDENT and hides sensitive fields', async () => {
      const res = await request(http)
        .post('/api/auth/register')
        .send(account)
        .expect(201);
      expect(res.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });

      const me = await request(http)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      expect(me.body).toMatchObject({ email: account.email, role: 'STUDENT' });
      expect(me.body).not.toHaveProperty('passwordHash');
      expect(me.body).not.toHaveProperty('refreshTokenHash');
    });

    it('rejects duplicate emails', async () => {
      await request(http).post('/api/auth/register').send(account).expect(409);
    });

    it('does not let a client choose its own role at registration', async () => {
      await request(http)
        .post('/api/auth/register')
        .send({ ...account, email: emailOf('escalation'), role: 'ADMIN' })
        .expect(400);
    });

    it('rejects wrong passwords and unknown emails with the same status', async () => {
      await request(http)
        .post('/api/auth/login')
        .send({ email: account.email, password: 'wrong-password-1' })
        .expect(401);
      await request(http)
        .post('/api/auth/login')
        .send({ email: emailOf('ghost'), password: PASSWORD })
        .expect(401);
    });

    it('logs in with valid credentials', async () => {
      const res = await request(http)
        .post('/api/auth/login')
        .send({ email: account.email, password: account.password })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      refreshToken = res.body.refreshToken;
    });

    it('rejects malformed refresh tokens', async () => {
      await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'not-a-jwt' })
        .expect(400);
    });

    it('rotates the refresh token on every use', async () => {
      const res = await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.refreshToken).not.toBe(refreshToken);
      previousRefreshToken = refreshToken;
      refreshToken = res.body.refreshToken;
    });

    it('revokes the whole session when an old refresh token is reused', async () => {
      await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken: previousRefreshToken })
        .expect(401);

      // The legitimate, newest token is now revoked as well.
      await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('revokes the refresh token on logout', async () => {
      const login = await request(http)
        .post('/api/auth/login')
        .send({ email: account.email, password: account.password })
        .expect(200);

      await request(http)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(204);

      await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });
  });

  describe('courses', () => {
    it('forbids students from creating courses', async () => {
      await request(http)
        .post('/api/courses')
        .set('Authorization', bearer('student'))
        .send({ title: 'Not allowed', description: 'Students cannot teach' })
        .expect(403);
    });

    it('requires authentication to list courses', async () => {
      await request(http).get('/api/courses').expect(401);
    });

    it('lets an instructor create a published course and a draft', async () => {
      const published = await request(http)
        .post('/api/courses')
        .set('Authorization', bearer('owner'))
        .send({
          title: `Published ${RUN_ID}`,
          description: 'A published course',
          published: true,
        })
        .expect(201);
      expect(published.body.instructorId).toBe(ids.owner);
      publishedCourseId = published.body.id;

      const draft = await request(http)
        .post('/api/courses')
        .set('Authorization', bearer('owner'))
        .send({ title: `Draft ${RUN_ID}`, description: 'A draft course' })
        .expect(201);
      expect(draft.body.published).toBe(false);
      draftCourseId = draft.body.id;
    });

    it('rejects invalid payloads and unknown fields', async () => {
      await request(http)
        .post('/api/courses')
        .set('Authorization', bearer('owner'))
        .send({ title: '', description: 'Empty title' })
        .expect(400);

      await request(http)
        .post('/api/courses')
        .set('Authorization', bearer('owner'))
        .send({ title: 'T', description: 'D', instructorId: ids.other })
        .expect(400);
    });

    it('shows students only published courses', async () => {
      const res = await searchCourses('student').expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].id).toBe(publishedCourseId);
    });

    it('shows drafts only to their owner and to admins', async () => {
      const owner = await searchCourses('owner').expect(200);
      const admin = await searchCourses('admin').expect(200);
      const other = await searchCourses('other').expect(200);

      expect(owner.body.meta.total).toBe(2);
      expect(admin.body.meta.total).toBe(2);
      expect(other.body.meta.total).toBe(1);
    });

    it('answers 404 to students asking for a draft', async () => {
      await request(http)
        .get(`/api/courses/${draftCourseId}`)
        .set('Authorization', bearer('student'))
        .expect(404);

      await request(http)
        .get(`/api/courses/${draftCourseId}`)
        .set('Authorization', bearer('owner'))
        .expect(200);

      await request(http)
        .post(`/api/courses/${draftCourseId}/enroll`)
        .set('Authorization', bearer('student'))
        .expect(404);
    });

    it('paginates results and validates query parameters', async () => {
      const res = await searchCourses('admin', '&limit=1&page=2').expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toEqual({
        total: 2,
        page: 2,
        limit: 1,
        totalPages: 2,
      });

      await request(http)
        .get('/api/courses?limit=1000')
        .set('Authorization', bearer('admin'))
        .expect(400);
    });
  });

  describe('enrollments', () => {
    it('only lets students enroll', async () => {
      await request(http)
        .post(`/api/courses/${publishedCourseId}/enroll`)
        .set('Authorization', bearer('owner'))
        .expect(403);
    });

    it('enrolls a student, rejects duplicates and lists enrollments', async () => {
      const enrolled = await request(http)
        .post(`/api/courses/${publishedCourseId}/enroll`)
        .set('Authorization', bearer('student'))
        .expect(201);
      expect(enrolled.body.courseId).toBe(publishedCourseId);

      await request(http)
        .post(`/api/courses/${publishedCourseId}/enroll`)
        .set('Authorization', bearer('student'))
        .expect(409);

      const mine = await request(http)
        .get('/api/enrollments/me')
        .set('Authorization', bearer('student'))
        .expect(200);
      expect(mine.body).toHaveLength(1);
      expect(mine.body[0].course.id).toBe(publishedCourseId);
    });

    it('shows the roster only to the course owner and to admins', async () => {
      const roster = await request(http)
        .get(`/api/courses/${publishedCourseId}/students`)
        .set('Authorization', bearer('owner'))
        .expect(200);
      expect(roster.body).toHaveLength(1);
      expect(roster.body[0].user.email).toBe(emailOf('student'));
      expect(JSON.stringify(roster.body)).not.toContain('passwordHash');

      await request(http)
        .get(`/api/courses/${publishedCourseId}/students`)
        .set('Authorization', bearer('admin'))
        .expect(200);

      await request(http)
        .get(`/api/courses/${publishedCourseId}/students`)
        .set('Authorization', bearer('other'))
        .expect(403);

      await request(http)
        .get(`/api/courses/${publishedCourseId}/students`)
        .set('Authorization', bearer('student'))
        .expect(403);
    });

    it('lets a student leave a course only once', async () => {
      await request(http)
        .delete(`/api/courses/${publishedCourseId}/enroll`)
        .set('Authorization', bearer('student'))
        .expect(204);

      await request(http)
        .delete(`/api/courses/${publishedCourseId}/enroll`)
        .set('Authorization', bearer('student'))
        .expect(404);
    });
  });

  describe('course ownership', () => {
    it('forbids other instructors from editing a course', async () => {
      await request(http)
        .patch(`/api/courses/${publishedCourseId}`)
        .set('Authorization', bearer('other'))
        .send({ title: 'Hijacked' })
        .expect(403);
    });

    it('lets the owner and an admin edit a course', async () => {
      const byOwner = await request(http)
        .patch(`/api/courses/${publishedCourseId}`)
        .set('Authorization', bearer('owner'))
        .send({ title: `Published ${RUN_ID} v2` })
        .expect(200);
      expect(byOwner.body.title).toBe(`Published ${RUN_ID} v2`);

      const byAdmin = await request(http)
        .patch(`/api/courses/${publishedCourseId}`)
        .set('Authorization', bearer('admin'))
        .send({ description: 'Edited by an admin' })
        .expect(200);
      expect(byAdmin.body.description).toBe('Edited by an admin');
    });

    it('refuses to reassign course ownership', async () => {
      await request(http)
        .patch(`/api/courses/${publishedCourseId}`)
        .set('Authorization', bearer('owner'))
        .send({ instructorId: ids.other })
        .expect(400);
    });

    it('only lets the owner (or an admin) delete a course', async () => {
      await request(http)
        .delete(`/api/courses/${publishedCourseId}`)
        .set('Authorization', bearer('other'))
        .expect(403);

      await request(http)
        .delete(`/api/courses/${publishedCourseId}`)
        .set('Authorization', bearer('owner'))
        .expect(204);

      await request(http)
        .get(`/api/courses/${publishedCourseId}`)
        .set('Authorization', bearer('owner'))
        .expect(404);
    });
  });

  describe('role management', () => {
    it('forbids non-admins from changing roles or listing users', async () => {
      await request(http)
        .patch(`/api/users/${ids.owner}/role`)
        .set('Authorization', bearer('student'))
        .send({ role: 'ADMIN' })
        .expect(403);

      await request(http)
        .get('/api/users')
        .set('Authorization', bearer('student'))
        .expect(403);

      await request(http)
        .get('/api/users')
        .set('Authorization', bearer('owner'))
        .expect(403);
    });

    it('prevents an admin from changing their own role', async () => {
      await request(http)
        .patch(`/api/users/${ids.admin}/role`)
        .set('Authorization', bearer('admin'))
        .send({ role: 'STUDENT' })
        .expect(403);
    });

    it('validates the payload and the target user', async () => {
      await request(http)
        .patch(`/api/users/${ids.student}/role`)
        .set('Authorization', bearer('admin'))
        .send({ role: 'SUPERUSER' })
        .expect(400);

      await request(http)
        .patch('/api/users/not-a-uuid/role')
        .set('Authorization', bearer('admin'))
        .send({ role: 'STUDENT' })
        .expect(400);

      await request(http)
        .patch('/api/users/00000000-0000-4000-8000-0000000000ff/role')
        .set('Authorization', bearer('admin'))
        .send({ role: 'STUDENT' })
        .expect(404);
    });

    it('lets an admin promote and demote a user', async () => {
      const promoted = await request(http)
        .patch(`/api/users/${ids.student}/role`)
        .set('Authorization', bearer('admin'))
        .send({ role: 'INSTRUCTOR' })
        .expect(200);
      expect(promoted.body.role).toBe('INSTRUCTOR');

      const stored = await prisma.user.findUnique({
        where: { id: ids.student },
      });
      expect(stored?.role).toBe(Role.INSTRUCTOR);

      const demoted = await request(http)
        .patch(`/api/users/${ids.student}/role`)
        .set('Authorization', bearer('admin'))
        .send({ role: 'STUDENT' })
        .expect(200);
      expect(demoted.body.role).toBe('STUDENT');
    });

    it('lists users for admins without exposing sensitive fields', async () => {
      const res = await request(http)
        .get('/api/users')
        .set('Authorization', bearer('admin'))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(
        res.body.some((user: { email: string }) => user.email === emailOf('student')),
      ).toBe(true);

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshTokenHash');
    });
  });
});