import { Module } from '@nestjs/common';

import {
  AdminPublicPagesController,
  AdminPublicPagesMediaController,
  PublicPagesController,
} from './public-pages.controller';
import { PublicPagesService } from './public-pages.service';
import { HomepageModule } from '../homepage/homepage.module';

@Module({
  imports: [HomepageModule],
  controllers: [
    AdminPublicPagesController,
    AdminPublicPagesMediaController,
    PublicPagesController,
  ],
  providers: [PublicPagesService],
  exports: [PublicPagesService],
})
export class PublicPagesModule {}
