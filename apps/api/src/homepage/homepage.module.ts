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

@Module({
  imports: [ProductMediaModule],
  controllers: [
    AdminHomepageController,
    PublicHomepageController,
    AdminHomepageMediaController,
    PublicHomepageMediaController,
    CategoryCoverController,
  ],
  providers: [HomepageService, HomepageMediaService, CategoryCoverService],
  exports: [HomepageService],
})
export class HomepageModule {}
