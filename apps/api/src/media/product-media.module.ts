import { Module } from '@nestjs/common';

import {
  AdminProductMediaController,
  PublicProductMediaController,
} from './product-media.controller';
import { ProductMediaService } from './product-media.service';

@Module({
  controllers: [AdminProductMediaController, PublicProductMediaController],
  providers: [ProductMediaService],
})
export class ProductMediaModule {}
