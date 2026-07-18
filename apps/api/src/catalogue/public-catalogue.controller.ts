import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  catalogueSlugSchema,
  categoryListQuerySchema,
  productListQuerySchema,
  type CategoryListQuery,
  type ProductListQuery,
} from '@mensah-rentals/validation';

import { Public } from '../auth/public.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { CatalogueService } from './catalogue.service';

@Public()
@Controller('public/categories')
export class PublicCategoriesController {
  constructor(
    @Inject(CatalogueService) private readonly catalogue: CatalogueService,
  ) {}

  @Get()
  list(
    @Query(new ZodBodyPipe(categoryListQuerySchema)) query: CategoryListQuery,
  ) {
    return this.catalogue.listPublicCategories(query);
  }

  @Get(':slug')
  get(@Param('slug', new ZodBodyPipe(catalogueSlugSchema)) slug: string) {
    return this.catalogue.getPublicCategory(slug);
  }
}

@Public()
@Controller('public/products')
export class PublicProductsController {
  constructor(
    @Inject(CatalogueService) private readonly catalogue: CatalogueService,
  ) {}

  @Get()
  list(
    @Query(new ZodBodyPipe(productListQuerySchema)) query: ProductListQuery,
  ) {
    return this.catalogue.listPublicProducts(query);
  }

  @Get(':categorySlug/:productSlug')
  get(
    @Param('categorySlug', new ZodBodyPipe(catalogueSlugSchema))
    categorySlug: string,
    @Param('productSlug', new ZodBodyPipe(catalogueSlugSchema))
    productSlug: string,
  ) {
    return this.catalogue.getPublicProduct(categorySlug, productSlug);
  }
}
