import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

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
    password: process.env.SEED_ADMIN_PASSWORD ?? 'change-me-please',
  });
  console.log(`Seed OK: admin user ${admin.email}`);

  // Demo data must never be created in production.
  if (process.env.NODE_ENV === 'production') {
    console.log('Production environment: demo data skipped');
    return;
  }

  const instructor = await upsertUser({
    email: 'instructor@learnhub.dev',
    fullName: 'Demo Instructor',
    role: Role.INSTRUCTOR,
    password: 'Instructor12345!',
  });
  console.log(`Seed OK: demo instructor ${instructor.email}`);

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

  for (const course of courses) {
    await prisma.course.upsert({
      where: { id: course.id },
      update: {},
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