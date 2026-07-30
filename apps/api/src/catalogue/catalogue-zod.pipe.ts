import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

@Injectable()
export class CatalogueZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        message: 'Invalid category deletion request',
        statusCode: 422,
      });
    return result.data;
  }
}
