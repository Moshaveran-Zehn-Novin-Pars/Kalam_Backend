import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

// فون‌های مخصوص هر test suite
export const TEST_PHONES = {
  APP: [] as string[],
  AUTH: ['09100000099', '09100000088', '09100000077', '09100000066'],
  USERS: ['09100000011', '09111111121', '09155555551'],
  ADDRESSES: ['09166666661', '09166666662'],
};

async function cleanByPhones(phones: string[]) {
  if (phones.length === 0) return;

  await prisma.otpCode.deleteMany({
    where: { phone: { in: phones } },
  });

  const users = await prisma.user.findMany({
    where: { phone: { in: phones } },
    select: { id: true },
  });

  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    await prisma.session.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.wallet.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
}

export async function cleanAuthTestData() {
  await cleanByPhones(TEST_PHONES.AUTH);
}

export async function cleanUsersTestData() {
  await cleanByPhones(TEST_PHONES.USERS);
}

export async function cleanTestDatabase() {
  await cleanByPhones([...TEST_PHONES.AUTH, ...TEST_PHONES.USERS]);
}

export async function cleanTestDatabaseBefore() {
  await cleanTestDatabase();
}

export { prisma as testPrisma };
