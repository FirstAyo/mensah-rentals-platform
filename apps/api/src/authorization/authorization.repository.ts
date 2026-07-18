import { Injectable } from '@nestjs/common';
import { prisma, type PrismaClient } from '@mensah-rentals/database';

@Injectable()
export class AuthorizationRepository {
  readonly prisma: PrismaClient = prisma;
}
