import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';

import type { AuthenticatedStaffRequest } from './auth.types';

export const CurrentStaffUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): StaffUserResponse => {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedStaffRequest>();

    if (!request.staffUser) {
      throw new Error('Authenticated staff principal was not attached');
    }

    return request.staffUser;
  },
);
