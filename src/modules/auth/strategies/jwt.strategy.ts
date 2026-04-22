import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AppConfigService } from '../../../config';
import { UserRole, UserStatus } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: UserRole;
  sessionId: string;
}

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  sessionId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        phone: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('کاربر یافت نشد');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }

    // Check session is still valid
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException('نشست نامعتبر است');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('نشست منقضی شده است');
    }

    return {
      id: user.id,
      phone: user.phone,
      role: user.role,
      status: user.status,
      sessionId: payload.sessionId,
    };
  }
}
