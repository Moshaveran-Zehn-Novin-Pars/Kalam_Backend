import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

export async function cleanTestDatabase() {
  // فقط test data هایی که خودمون ساختیم رو پاک می‌کنیم
  await prisma.otpCode.deleteMany({
    where: {
      phone: {
        in: ['09100000099', '09100000088', '09100000077', '09100000066'],
      },
    },
  });
  await prisma.session.deleteMany({
    where: {
      user: {
        phone: {
          in: ['09100000099', '09100000088', '09100000077', '09100000066'],
        },
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      phone: {
        in: ['09100000099', '09100000088', '09100000077', '09100000066'],
      },
    },
  });
}

export { prisma as testPrisma };
