import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UpdateProfileDto, QueryUsersDto } from './dto';
import { UserRole, UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Get All Users (Admin)
  // ============================================
  async findAll(query: QueryUsersDto) {
    const { page = 1, pageSize = 10, role, status, search } = query;
    const skip = (page - 1) * pageSize;

    const where = {
      deletedAt: null,
      ...(role && { role }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { phone: { contains: search } },
          { firstName: { contains: search } },
          { lastName: { contains: search } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          kycStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ============================================
  // Get User by ID
  // ============================================
  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        kycStatus: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        farmer: {
          select: {
            id: true,
            businessName: true,
            farmLocation: true,
            ratingAvg: true,
            ratingCount: true,
            verifiedAt: true,
          },
        },
        buyer: {
          select: {
            id: true,
            businessName: true,
            businessType: true,
            creditLimit: true,
            verifiedAt: true,
          },
        },
        driver: {
          select: {
            id: true,
            vehicleType: true,
            capacityKg: true,
            isAvailable: true,
          },
        },
        wallet: {
          select: {
            balance: true,
            currency: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    return user;
  }

  // ============================================
  // Update Profile
  // ============================================
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    // Check email uniqueness
    if (dto.email && dto.email !== user.email) {
      const emailExists = await this.prisma.user.findFirst({
        where: { email: dto.email, deletedAt: null },
      });
      if (emailExists) {
        throw new ConflictException('این ایمیل قبلاً ثبت شده است');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.email && { email: dto.email }),
      },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        kycStatus: true,
        updatedAt: true,
      },
    });

    this.logger.log(`Profile updated: ${userId}`);
    return updated;
  }

  // ============================================
  // Suspend User (Admin)
  // ============================================
  async suspendUser(adminId: string, userId: string, reason: string) {
    // Can't suspend yourself
    if (adminId === userId) {
      throw new ForbiddenException('نمی‌توانید حساب خود را تعلیق کنید');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    // Can't suspend another admin
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('نمی‌توانید حساب ادمین را تعلیق کنید');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.SUSPENDED },
    });

    // Revoke all sessions
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.logger.log(
      `User suspended: ${userId} by admin: ${adminId} - ${reason}`,
    );

    return { message: 'کاربر با موفقیت تعلیق شد' };
  }

  // ============================================
  // Activate User (Admin)
  // ============================================
  async activateUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });

    return { message: 'کاربر با موفقیت فعال شد' };
  }

  // ============================================
  // Delete User (Soft Delete - Admin)
  // ============================================
  async deleteUser(adminId: string, userId: string) {
    if (adminId === userId) {
      throw new ForbiddenException('نمی‌توانید حساب خود را حذف کنید');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`User deleted: ${userId} by admin: ${adminId}`);

    return { message: 'کاربر با موفقیت حذف شد' };
  }
}
