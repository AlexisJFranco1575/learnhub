import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const isProduction = process.env.NODE_ENV === 'production';
const MIN_PRODUCTION_PASSWORD_LENGTH = 10;

// Public demo credentials. They only exist when demo data is enabled.
const DEMO_INSTRUCTOR = {
  email: 'instructor@learnhub.dev',
  fullName: 'Demo Instructor',
  password: 'Instructor12345!',
};
const DEMO_STUDENT = {
  email: 'student@learnhub.dev',
  fullName: 'Demo Student',
  password: 'Student12345!',
};

function resolveAdminPassword(): string {
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (isProduction) {
    // Never fall back to a known default password in production.
    if (!password || password.length < MIN_PRODUCTION_PASSWORD_LENGTH) {
      throw new Error(
        `SEED_ADMIN_PASSWORD must be set (at least ${MIN_PRODUCTION_PASSWORD_LENGTH} characters) in production`,
      );
    }
    return password;
  }

  return password ?? 'change-me-please';
}

async function upsertUser(params: {
  email: string;
  fullName: string;
  role: Role;
  password: string;
}) {
  const email = params.email.toLowerCase();
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      fullName: params.fullName,
      role: params.role,
      passwordHash: await argon2.hash(params.password),
    },
  });
}

async function main() {
  const admin = await upsertUser({
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@learnhub.dev',
    fullName: 'LearnHub Admin',
    role: Role.ADMIN,
    password: resolveAdminPassword(),
  });
  console.log(`Seed OK: admin user ${admin.email}`);

  // Demo data is on by default outside production; in production it must be
  // requested explicitly (public demo deployments).
  const seedDemo = !isProduction || process.env.SEED_DEMO_DATA === 'true';
  if (!seedDemo) {
    console.log('Demo data skipped (set SEED_DEMO_DATA=true to create it)');
    return;
  }

  const instructor = await upsertUser({
    ...DEMO_INSTRUCTOR,
    role: Role.INSTRUCTOR,
  });
  console.log(`Seed OK: demo instructor ${instructor.email}`);

  const student = await upsertUser({ ...DEMO_STUDENT, role: Role.STUDENT });
  console.log(`Seed OK: demo student ${student.email}`);

  const courses = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'TypeScript for Backend Developers',
      description: 'Types, generics and patterns for server-side code.',
      published: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      title: 'PostgreSQL Performance Tuning',
      description: 'Indexes, EXPLAIN ANALYZE and query optimization.',
      published: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      title: 'Docker in Practice (draft)',
      description: 'Work in progress: only visible to its owner and admins.',
      published: false,
    },
  ];

  // Demo courses are reset on every start, so a public demo heals itself.
  for (const course of courses) {
    await prisma.course.upsert({
      where: { id: course.id },
      update: {
        title: course.title,
        description: course.description,
        published: course.published,
      },
      create: { ...course, instructorId: instructor.id },
    });
  }
  console.log(`Seed OK: ${courses.length} demo courses`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());