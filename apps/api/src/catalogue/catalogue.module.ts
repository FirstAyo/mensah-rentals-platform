import { Module } from '@nestjs/common';

import {
  AdminCategoriesController,
  AdminProductsController,
} from './admin-catalogue.controller';
import { CatalogueRepository } from './catalogue.repository';
import { CatalogueService } from './catalogue.service';
import { ProductMediaModule } from '../media/product-media.module';
import {
  PublicCategoriesController,
  PublicProductsController,
} from './public-catalogue.controller';

@Module({
  imports: [ProductMediaModule],
  controllers: [
    AdminCategoriesController,
    AdminProductsController,
    PublicCategoriesController,
    PublicProductsController,
  ],
  providers: [CatalogueRepository, CatalogueService],
})
export class CatalogueModule {}
