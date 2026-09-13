import { Module } from '@nestjs/common';

import {
  AdminGalleryController,
  PublicGalleryController,
} from './gallery.controller';
import { GalleryService } from './gallery.service';

@Module({
  controllers: [AdminGalleryController, PublicGalleryController],
  providers: [GalleryService],
  exports: [GalleryService],
})
export class GalleryModule {}
