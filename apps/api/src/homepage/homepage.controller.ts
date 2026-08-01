import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import {
  cuidParamSchema,
  homepageMutationSchema,
  saveHomepageDraftSchema,
  type HomepageMutationInput,
  type SaveHomepageDraftInput,
} from '@mensah-rentals/validation';
import type { StaffUserResponse } from '@mensah-rentals/types';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { Public } from '../auth/public.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { HomepageService } from './homepage.service';

@Controller('public/homepage')
export class PublicHomepageController {
  constructor(
    @Inject(HomepageService) private readonly homepage: HomepageService,
  ) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=0, must-revalidate')
  get(): Promise<unknown> {
    return this.homepage.getPublicHomepage();
  }
}

@Controller('admin/homepage')
export class AdminHomepageController {
  constructor(
    @Inject(HomepageService) private readonly homepage: HomepageService,
  ) {}

  @Get()
  @RequirePermissions('homepage.view')
  get(): Promise<unknown> {
    return this.homepage.getAdminHomepage();
  }

  @Post('drafts')
  @RequirePermissions('homepage.edit')
  saveDraft(
    @Body(new ZodBodyPipe(saveHomepageDraftSchema))
    input: SaveHomepageDraftInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ): Promise<unknown> {
    return this.homepage.saveDraft(input, user.id);
  }

  @Get('revisions/:revisionId/preview')
  @RequirePermissions('homepage.preview')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  preview(
    @Param('revisionId', new ZodBodyPipe(cuidParamSchema)) revisionId: string,
  ): Promise<unknown> {
    return this.homepage.preview(revisionId);
  }

  @Post('drafts/:revisionId/publish')
  @RequirePermissions('homepage.publish')
  publish(
    @Param('revisionId', new ZodBodyPipe(cuidParamSchema)) revisionId: string,
    @Body(new ZodBodyPipe(homepageMutationSchema)) input: HomepageMutationInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ): Promise<unknown> {
    return this.homepage.publish(revisionId, input, user.id);
  }

  @Post('revisions/:revisionId/restore')
  @RequirePermissions('homepage.publish')
  restore(
    @Param('revisionId', new ZodBodyPipe(cuidParamSchema)) revisionId: string,
    @Body(new ZodBodyPipe(homepageMutationSchema)) input: HomepageMutationInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ): Promise<unknown> {
    return this.homepage.restore(revisionId, input, user.id);
  }

  @Get('google-reviews/status')
  @RequirePermissions('homepage.google_reviews.view_status')
  status() {
    return this.homepage.googleReviewsStatus();
  }
}
