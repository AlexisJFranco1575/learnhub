import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@learnhub.dev').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'change-me-please';

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      fullName: 'LearnHub Admin',
      role: Role.ADMIN,
      passwordHash: await argon2.hash(password),
    },
  });

  console.log(`Seed OK: admin user ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());