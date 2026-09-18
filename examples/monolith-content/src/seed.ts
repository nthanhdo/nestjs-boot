/**
 * Seed script — populates content types and sample entries.
 *
 * Usage:
 *   npm run db:push   # create tables first
 *   npm run db:seed   # then seed data
 */
import { seedContentData } from 'nestjs-boot/content';

async function main() {
  // Use PrismaClient directly for seeding
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    await seedContentData(prisma);
    console.log('Seed complete!');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
