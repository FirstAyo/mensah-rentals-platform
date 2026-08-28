import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  publicPageKeySchema,
  cuidParamSchema,
  publicPageMutationSchema,
  publicPageRevisionParamSchema,
  savePublicPageDraftSchema,
  homepageMediaLibraryQuerySchema,
  homepageMediaMetadataSchema,
  HOMEPAGE_MEDIA_LIMITS,
  type HomepageMediaLibraryQuery,
  type PublicPageKey,
  type PublicPageMutationInput,
  type SavePublicPageDraftInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { Public } from '../auth/public.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { AllowMultipart } from '../auth/origin.guard';
import { HomepageMediaService } from '../homepage/homepage-media.service';
import { PublicPagesService } from './public-pages.service';

@Controller('admin/public-pages')
export class AdminPublicPagesController {
  constructor(
    @Inject(PublicPagesService) private readonly pages: PublicPagesService,
  ) {}

  @Get()
  @RequirePermissions('public_pages.view')
  @Header('Cache-Control', 'private, no-store')
  list() {
    return this.pages.list();
  }

  @Get(':key')
  @RequirePermissions('public_pages.view')
  @Header('Cache-Control', 'private, no-store')
  detail(
    @Param('key', new ZodBodyPipe(publicPageKeySchema)) key: PublicPageKey,
  ) {
    return this.pages.detail(key);
  }

  @Put(':key/draft')
  @RequirePermissions('public_pages.edit')
  saveDraft(
    @Param('key', new ZodBodyPipe(publicPageKeySchema)) key: PublicPageKey,
    @Body(new ZodBodyPipe(savePublicPageDraftSchema))
    input: SavePublicPageDraftInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.pages.saveDraft(key, input, user.id);
  }

  @Post(':key/drafts/:revisionId/publish')
  @HttpCode(200)
  @RequirePermissions('public_pages.publish')
  publish(
    @Param('key', new ZodBodyPipe(publicPageKeySchema)) key: PublicPageKey,
    @Param('revisionId', new ZodBodyPipe(publicPageRevisionParamSchema))
    revisionId: string,
    @Body(new ZodBodyPipe(publicPageMutationSchema))
    input: PublicPageMutationInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.pages.publish(key, revisionId, input, user.id);
  }

  @Post(':key/revisions/:revisionId/restore')
  @HttpCode(200)
  @RequirePermissions('public_pages.publish')
  restore(
    @Param('key', new ZodBodyPipe(publicPageKeySchema)) key: PublicPageKey,
    @Param('revisionId', new ZodBodyPipe(publicPageRevisionParamSchema))
    revisionId: string,
    @Body(new ZodBodyPipe(publicPageMutationSchema))
    input: PublicPageMutationInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.pages.restore(key, revisionId, input, user.id);
  }

  @Get(':key/preview/:revisionId')
  @RequirePermissions('public_pages.view')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  preview(
    @Param('key', new ZodBodyPipe(publicPageKeySchema)) key: PublicPageKey,
    @Param('revisionId', new ZodBodyPipe(publicPageRevisionParamSchema))
    revisionId: string,
  ) {
    return this.pages.preview(key, revisionId);
  }
}

@Controller('admin/public-pages-media')
export class AdminPublicPagesMediaController {
  constructor(
    @Inject(HomepageMediaService) private readonly media: HomepageMediaService,
  ) {}

  @Get('library')
  @RequirePermissions('public_pages.view', 'product.view')
  library(
    @Query(new ZodBodyPipe(homepageMediaLibraryQuerySchema))
    query: HomepageMediaLibraryQuery,
  ) {
    return this.media.listLibrary(query);
  }

  @Post()
  @RequirePermissions('public_pages.edit')
  @AllowMultipart()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: HOMEPAGE_MEDIA_LIMITS.maxSourceBytes, files: 1 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodBodyPipe(homepageMediaMetadataSchema))
    body: { description: string },
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    if (!file?.buffer) throw new BadRequestException('Image file is required');
    return this.media.upload(
      file.buffer,
      file.originalname,
      body.description,
      user.id,
      'public_pages.edit',
    );
  }

  @Get(':id/:filename')
  @RequirePermissions('public_pages.view')
  @Header('Cache-Control', 'private, no-store')
  @Header('Content-Type', 'image/webp')
  async image(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Param('filename') filename: string,
  ) {
    return new StreamableFile(await this.media.read(id, filename, false));
  }
}

@Controller('public/pages')
export class PublicPagesController {
  constructor(
    @Inject(PublicPagesService) private readonly pages: PublicPagesService,
  ) {}

  @Public()
  @Get(':key')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  published(
    @Param('key', new ZodBodyPipe(publicPageKeySchema)) key: PublicPageKey,
  ) {
    return this.pages.published(key);
  }
}
