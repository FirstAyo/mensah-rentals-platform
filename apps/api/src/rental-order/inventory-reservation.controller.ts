import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  completeInventoryReservationSchema,
  createInventoryReservationSchema,
  cuidParamSchema,
  eligibleAssetsQuerySchema,
  releaseInventoryReservationSchema,
  type CompleteInventoryReservationInput,
  type CreateInventoryReservationInput,
  type EligibleAssetsQuery,
  type ReleaseInventoryReservationInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireFeature } from '../feature-settings/requires-feature.decorator';
import { InventoryReservationService } from './inventory-reservation.service';
import { RentalOrderNoStoreInterceptor } from './rental-order-no-store.interceptor';
import { RentalOrderZodPipe } from './rental-order-zod.pipe';

@Controller('admin/orders/:orderId')
@RequireFeature('RESERVATIONS')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class InventoryReservationController {
  constructor(
    @Inject(InventoryReservationService)
    private readonly reservations: InventoryReservationService,
  ) {}

  @Get('reservation')
  @RequirePermissions('inventory.reservation.view')
  get(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
  ) {
    return this.reservations.get(actor.id, orderId);
  }

  @Get('availability')
  @RequirePermissions('inventory.availability.view')
  availability(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
  ) {
    return this.reservations.availability(actor.id, orderId);
  }

  @Get('eligible-assets')
  @RequirePermissions('inventory.availability.view')
  eligibleAssetsForOrder(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
    @Query(new RentalOrderZodPipe(eligibleAssetsQuerySchema))
    query: EligibleAssetsQuery,
  ) {
    return this.reservations.eligibleAssetsForOrder(
      actor.id,
      orderId,
      query.rentalOrderItemId,
    );
  }

  @Post('reservations')
  @RequirePermissions('inventory.reservation.create')
  create(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
    @Body(new RentalOrderZodPipe(createInventoryReservationSchema))
    input: CreateInventoryReservationInput,
  ) {
    return this.reservations.create(actor.id, orderId, input);
  }

  @Post('reservations/:reservationId/complete')
  @RequirePermissions('inventory.reservation.update')
  complete(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
    @Param('reservationId', new RentalOrderZodPipe(cuidParamSchema))
    reservationId: string,
    @Body(new RentalOrderZodPipe(completeInventoryReservationSchema))
    input: CompleteInventoryReservationInput,
  ) {
    return this.reservations.complete(actor.id, orderId, reservationId, input);
  }

  @Post('reservations/:reservationId/release')
  @RequirePermissions('inventory.reservation.release')
  release(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
    @Param('reservationId', new RentalOrderZodPipe(cuidParamSchema))
    reservationId: string,
    @Body(new RentalOrderZodPipe(releaseInventoryReservationSchema))
    input: ReleaseInventoryReservationInput,
  ) {
    return this.reservations.release(actor.id, orderId, reservationId, input);
  }

  @Get('reservations/:reservationId/eligible-assets')
  @RequirePermissions('inventory.availability.view')
  eligibleAssets(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('orderId', new RentalOrderZodPipe(cuidParamSchema)) orderId: string,
    @Param('reservationId', new RentalOrderZodPipe(cuidParamSchema))
    reservationId: string,
    @Query(new RentalOrderZodPipe(eligibleAssetsQuerySchema))
    query: EligibleAssetsQuery,
  ) {
    return this.reservations.eligibleAssets(
      actor.id,
      orderId,
      reservationId,
      query.rentalOrderItemId,
    );
  }
}
