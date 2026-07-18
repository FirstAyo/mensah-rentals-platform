import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@mensah-rentals/database';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  async checkConnection(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await prisma.$disconnect();
  }
}
