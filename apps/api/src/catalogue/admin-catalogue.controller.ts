import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  categoryListQuerySchema,
  createCategorySchema,
  createProductSchema,
  cuidParamSchema,
  productListQuerySchema,
  updateCategorySchema,
  updateProductSchema,
  type CategoryListQuery,
  type CreateCategoryInput,
  type CreateProductInput,
  type ProductListQuery,
  type UpdateCategoryInput,
  type UpdateProductInput,
} from '@mensah-rentals/validation';

import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CatalogueService } from './catalogue.service';

@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(
    @Inject(CatalogueService) private readonly catalogue: CatalogueService,
  ) {}

  @Get()
  @RequirePermissions('category.view')
  list(
    @Query(new ZodBodyPipe(categoryListQuerySchema)) query: CategoryListQuery,
  ) {
    return this.catalogue.listAdminCategories(query);
  }

  @Get(':id')
  @RequirePermissions('category.view')
  get(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.catalogue.getAdminCategory(id);
  }

  @Post()
  @RequirePermissions('category.create')
  create(
    @Body(new ZodBodyPipe(createCategorySchema)) input: CreateCategoryInput,
  ) {
    return this.catalogue.createCategory(input);
  }

  @Put(':id')
  @RequirePermissions('category.update')
  update(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(updateCategorySchema)) input: UpdateCategoryInput,
  ) {
    return this.catalogue.updateCategory(id, input);
  }

  @Delete(':id')
  @RequirePermissions('category.delete')
  deactivate(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.catalogue.deactivateCategory(id);
  }

  @Post(':id/activate')
  @RequirePermissions('category.update')
  activate(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.catalogue.activateCategory(id);
  }
}

@Controller('admin/products')
export class AdminProductsController {
  constructor(
    @Inject(CatalogueService) private readonly catalogue: CatalogueService,
  ) {}

  @Get()
  @RequirePermissions('product.view')
  list(
    @Query(new ZodBodyPipe(productListQuerySchema)) query: ProductListQuery,
  ) {
    return this.catalogue.listAdminProducts(query);
  }

  @Get(':id')
  @RequirePermissions('product.view')
  get(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.catalogue.getAdminProduct(id);
  }

  @Post()
  @RequirePermissions('product.create')
  create(
    @Body(new ZodBodyPipe(createProductSchema)) input: CreateProductInput,
  ) {
    return this.catalogue.createProduct(input);
  }

  @Put(':id')
  @RequirePermissions('product.update')
  update(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(updateProductSchema)) input: UpdateProductInput,
  ) {
    return this.catalogue.updateProduct(id, input);
  }

  @Delete(':id')
  @RequirePermissions('product.delete')
  deactivate(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.catalogue.deactivateProduct(id);
  }

  @Post(':id/activate')
  @RequirePermissions('product.update')
  activate(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.catalogue.activateProduct(id);
  }
}
