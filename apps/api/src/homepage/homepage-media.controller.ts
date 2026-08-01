import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  cuidParamSchema,
  homepageMediaLibraryQuerySchema,
  homepageMediaMetadataSchema,
  HOMEPAGE_MEDIA_LIMITS,
  type HomepageMediaLibraryQuery,
} from '@mensah-rentals/validation';
import type { StaffUserResponse } from '@mensah-rentals/types';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { AllowMultipart } from '../auth/origin.guard';
import { Public } from '../auth/public.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { HomepageMediaService } from './homepage-media.service';

@Controller('admin/homepage/media')
export class AdminHomepageMediaController {
  constructor(
    @Inject(HomepageMediaService) private readonly media: HomepageMediaService,
  ) {}

  @Get()
  @RequirePermissions('homepage.view')
  list() {
    return this.media.list();
  }

  @Get('library')
  @RequirePermissions('homepage.view', 'product.view')
  library(
    @Query(new ZodBodyPipe(homepageMediaLibraryQuerySchema))
    query: HomepageMediaLibraryQuery,
  ) {
    return this.media.listLibrary(query);
  }

  @Post()
  @RequirePermissions('homepage.media.manage')
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
    );
  }

  @Delete(':id')
  @RequirePermissions('homepage.media.manage')
  remove(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.media.remove(id, user.id);
  }

  @Get(':id/:filename')
  @RequirePermissions('homepage.preview')
  @Header('Cache-Control', 'private, no-store')
  @Header('Content-Type', 'image/webp')
  async image(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Param('filename') filename: string,
  ) {
    return new StreamableFile(await this.media.read(id, filename, false));
  }
}

@Controller('media/homepage')
export class PublicHomepageMediaController {
  constructor(
    @Inject(HomepageMediaService) private readonly media: HomepageMediaService,
  ) {}

  @Public()
  @Get(':id/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('Content-Type', 'image/webp')
  async image(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Param('filename') filename: string,
  ) {
    return new StreamableFile(await this.media.read(id, filename));
  }
}
