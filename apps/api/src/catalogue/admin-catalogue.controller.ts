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
  deleteCategorySchema,
  deleteProductSchema,
  productListQuerySchema,
  updateCategorySchema,
  updateProductSchema,
  type CategoryListQuery,
  type CreateCategoryInput,
  type CreateProductInput,
  type DeleteCategoryInput,
  type DeleteProductInput,
  type ProductListQuery,
  type UpdateCategoryInput,
  type UpdateProductInput,
} from '@mensah-rentals/validation';
import type { StaffUserResponse } from '@mensah-rentals/types';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CatalogueService } from './catalogue.service';
import { CatalogueZodPipe } from './catalogue-zod.pipe';

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
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.catalogue.createCategory(input, user.id);
  }

  @Put(':id')
  @RequirePermissions('category.update')
  update(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(updateCategorySchema)) input: UpdateCategoryInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.catalogue.updateCategory(id, input, user.id);
  }

  @Delete(':id')
  @RequirePermissions('category.delete')
  delete(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new CatalogueZodPipe(deleteCategorySchema))
    input: DeleteCategoryInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.catalogue.deleteCategory(id, input, user.id);
  }

  @Post(':id/deactivate')
  @RequirePermissions('category.update')
  deactivate(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.catalogue.deactivateCategory(id, user.id);
  }

  @Post(':id/activate')
  @RequirePermissions('category.update')
  activate(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.catalogue.activateCategory(id, user.id);
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
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.catalogue.createProduct(input, user.id);
  }

  @Put(':id')
  @RequirePermissions('product.update')
  update(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(updateProductSchema)) input: UpdateProductInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.catalogue.updateProduct(id, input, user.id);
  }

  @Delete(':id')
  @RequirePermissions('product.delete')
  delete(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(
      new CatalogueZodPipe(
        deleteProductSchema,
        'Invalid product deletion request',
      ),
    )
    input: DeleteProductInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.catalogue.deleteProduct(id, input, user.id);
  }

  @Post(':id/deactivate')
  @RequirePermissions('product.update')
  deactivate(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.catalogue.deactivateProduct(id, user.id);
  }

  @Post(':id/activate')
  @RequirePermissions('product.update')
  activate(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.catalogue.activateProduct(id, user.id);
  }
}
