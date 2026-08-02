import { Module } from '@nestjs/common';

import {
  AdminHomepageController,
  PublicHomepageController,
} from './homepage.controller';
import { HomepageService } from './homepage.service';
import {
  AdminHomepageMediaController,
  PublicHomepageMediaController,
} from './homepage-media.controller';
import { HomepageMediaService } from './homepage-media.service';
import { ProductMediaModule } from '../media/product-media.module';
import { CategoryCoverController } from './category-cover.controller';
import { CategoryCoverService } from './category-cover.service';
import {
  GOOGLE_PLACES_FETCH,
  GooglePlacesReviewsService,
} from './google-places-reviews.service';
import { PublicGoogleReviewsRateLimitGuard } from './public-google-reviews-rate-limit.guard';

@Module({
  imports: [ProductMediaModule],
  controllers: [
    AdminHomepageController,
    PublicHomepageController,
    AdminHomepageMediaController,
    PublicHomepageMediaController,
    CategoryCoverController,
  ],
  providers: [
    HomepageService,
    HomepageMediaService,
    CategoryCoverService,
    GooglePlacesReviewsService,
    PublicGoogleReviewsRateLimitGuard,
    { provide: GOOGLE_PLACES_FETCH, useFactory: () => fetch },
  ],
  exports: [HomepageService],
})
export class HomepageModule {}
