import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  createGalleryProjectSchema,
  cuidParamSchema,
  galleryAdminListQuerySchema,
  galleryMutationSchema,
  gallerySlugSchema,
  publicGalleryQuerySchema,
  saveGalleryDraftSchema,
  type CreateGalleryProjectInput,
  type GalleryAdminListQuery,
  type GalleryMutationInput,
  type PublicGalleryQuery,
  type SaveGalleryDraftInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { Public } from '../auth/public.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { PrivateNoStoreInterceptor } from '../common/private-no-store.interceptor';
import { GalleryService } from './gallery.service';

@Controller('public/gallery')
export class PublicGalleryController {
  constructor(
    @Inject(GalleryService) private readonly gallery: GalleryService,
  ) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=0, must-revalidate')
  list(
    @Query(new ZodBodyPipe(publicGalleryQuerySchema)) query: PublicGalleryQuery,
  ) {
    return this.gallery.publicList(query);
  }

  @Public()
  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=0, must-revalidate')
  detail(@Param('slug', new ZodBodyPipe(gallerySlugSchema)) slug: string) {
    return this.gallery.publicDetail(slug);
  }
}

@Controller('admin/gallery/projects')
@UseInterceptors(PrivateNoStoreInterceptor)
export class AdminGalleryController {
  constructor(
    @Inject(GalleryService) private readonly gallery: GalleryService,
  ) {}

  @Get()
  @RequirePermissions('gallery.view')
  list(
    @Query(new ZodBodyPipe(galleryAdminListQuerySchema))
    query: GalleryAdminListQuery,
  ) {
    return this.gallery.adminList(query);
  }

  @Post()
  @RequirePermissions('gallery.edit')
  create(
    @Body(new ZodBodyPipe(createGalleryProjectSchema))
    input: CreateGalleryProjectInput,
    @CurrentStaffUser() actor: StaffUserResponse,
  ) {
    return this.gallery.create(input, actor.id);
  }

  @Get(':id')
  @RequirePermissions('gallery.view')
  detail(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.gallery.adminDetail(id);
  }

  @Post(':id/drafts')
  @RequirePermissions('gallery.edit')
  saveDraft(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(saveGalleryDraftSchema)) input: SaveGalleryDraftInput,
    @CurrentStaffUser() actor: StaffUserResponse,
  ) {
    return this.gallery.saveDraft(id, input, actor.id);
  }

  @Get(':id/revisions/:revisionId/preview')
  @RequirePermissions('gallery.preview')
  preview(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Param('revisionId', new ZodBodyPipe(cuidParamSchema)) revisionId: string,
  ) {
    return this.gallery.preview(id, revisionId);
  }

  @Post(':id/drafts/:revisionId/publish')
  @RequirePermissions('gallery.publish')
  publish(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Param('revisionId', new ZodBodyPipe(cuidParamSchema)) revisionId: string,
    @Body(new ZodBodyPipe(galleryMutationSchema)) input: GalleryMutationInput,
    @CurrentStaffUser() actor: StaffUserResponse,
  ) {
    return this.gallery.publish(id, revisionId, input, actor.id);
  }

  @Post(':id/unpublish')
  @RequirePermissions('gallery.publish')
  unpublish(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(galleryMutationSchema)) input: GalleryMutationInput,
    @CurrentStaffUser() actor: StaffUserResponse,
  ) {
    return this.gallery.unpublish(id, input, actor.id);
  }

  @Post(':id/archive')
  @RequirePermissions('gallery.publish')
  archive(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(galleryMutationSchema)) input: GalleryMutationInput,
    @CurrentStaffUser() actor: StaffUserResponse,
  ) {
    return this.gallery.archive(id, input, actor.id);
  }
}
