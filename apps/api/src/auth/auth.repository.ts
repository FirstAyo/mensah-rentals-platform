import { Injectable } from '@nestjs/common';
import { prisma, UserStatus } from '@mensah-rentals/database';

import type { StaffCredentialRecord, ValidStaffSession } from './auth.types';
import { mapStaffUser } from './staff-user.mapper';

const rolesSelect = {
  select: {
    role: {
      select: {
        displayName: true,
        id: true,
        name: true,
        permissions: {
          select: { permission: { select: { key: true } } },
        },
      },
    },
  },
} as const;

@Injectable()
export class AuthRepository {
  findUserForLogin(email: string): Promise<StaffCredentialRecord | null> {
    return prisma.user.findUnique({
      select: {
        createdAt: true,
        email: true,
        firstName: true,
        id: true,
        lastLoginAt: true,
        lastName: true,
        passwordHash: true,
        roles: rolesSelect,
        status: true,
        updatedAt: true,
      },
      where: { email },
    });
  }

  async createSessionAndUpdateLogin(input: {
    expiresAt: Date;
    loggedInAt: Date;
    tokenHash: string;
    userId: string;
  }): Promise<ValidStaffSession | null> {
    return prisma.$transaction(async (transaction) => {
      const updateResult = await transaction.user.updateMany({
        data: { lastLoginAt: input.loggedInAt },
        where: { id: input.userId, status: UserStatus.ACTIVE },
      });
      if (updateResult.count !== 1) {
        return null;
      }

      const user = await transaction.user.findUniqueOrThrow({
        select: {
          createdAt: true,
          email: true,
          firstName: true,
          id: true,
          lastLoginAt: true,
          lastName: true,
          roles: rolesSelect,
          status: true,
          updatedAt: true,
        },
        where: { id: input.userId },
      });
      const session = await transaction.staffSession.create({
        data: {
          expiresAt: input.expiresAt,
          tokenHash: input.tokenHash,
          userId: input.userId,
        },
        select: { id: true },
      });

      return {
        sessionId: session.id,
        user: mapStaffUser(user),
      };
    });
  }

  async findValidSession(
    tokenHash: string,
    now: Date,
  ): Promise<ValidStaffSession | null> {
    const session = await prisma.staffSession.findFirst({
      select: {
        id: true,
        user: {
          select: {
            createdAt: true,
            email: true,
            firstName: true,
            id: true,
            lastLoginAt: true,
            lastName: true,
            roles: rolesSelect,
            status: true,
            updatedAt: true,
          },
        },
      },
      where: {
        expiresAt: { gt: now },
        tokenHash,
        user: { status: UserStatus.ACTIVE },
      },
    });

    if (!session) {
      return null;
    }

    return {
      sessionId: session.id,
      user: mapStaffUser(session.user),
    };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await prisma.staffSession.deleteMany({ where: { tokenHash } });
  }
}
