import { Injectable, type OnModuleInit } from '@nestjs/common';
import { hashPassword, verifyPassword } from '@mensah-rentals/auth';

@Injectable()
export class PasswordService implements OnModuleInit {
  private readonly dummyPasswordHash = hashPassword(
    'mensah-rentals-dummy-password-not-a-credential',
  );

  async onModuleInit(): Promise<void> {
    await this.dummyPasswordHash;
  }

  async verify(
    passwordHash: string | null,
    password: string,
  ): Promise<boolean> {
    const hashToVerify = passwordHash ?? (await this.dummyPasswordHash);
    return verifyPassword(hashToVerify, password);
  }
}
