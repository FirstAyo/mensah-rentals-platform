import { UnprocessableEntityException } from '@nestjs/common';
import type { ZodType } from 'zod';

export class RentalOrderZodPipe {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new UnprocessableEntityException('Rental order input is invalid');
    return result.data;
  }
}
