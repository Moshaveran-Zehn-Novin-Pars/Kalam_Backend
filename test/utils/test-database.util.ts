import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://kalam:kalam_dev@localhost:5455/kalam_test',
    },
  },
});

export async function cleanTestDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.review.deleteMany();
  await prisma.deliveryLocation.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.escrow.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.address.deleteMany();
  await prisma.farmer.deleteMany();
  await prisma.buyer.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

export { prisma as testPrisma };
