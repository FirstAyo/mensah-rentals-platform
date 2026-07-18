import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@mensah-rentals/database';
import type {
  AdminCategoryResponse,
  AdminProductResponse,
  PaginatedResponse,
  PublicCategoryResponse,
  PublicProductDetailResponse,
  PublicProductSummaryResponse,
} from '@mensah-rentals/types';
import type {
  CategoryListQuery,
  CreateCategoryInput,
  CreateProductInput,
  ProductListQuery,
  UpdateCategoryInput,
  UpdateProductInput,
} from '@mensah-rentals/validation';

import { CatalogueRepository } from './catalogue.repository';

const CATALOGUE_MUTATION_LOCK = 2_026_071_814;

const categorySelect = {
  _count: { select: { products: true } },
  createdAt: true,
  description: true,
  id: true,
  isActive: true,
  name: true,
  slug: true,
  sortOrder: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

const productSelect = {
  category: { select: { description: true, id: true, name: true, slug: true } },
  categoryId: true,
  createdAt: true,
  description: true,
  id: true,
  images: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  isActive: true,
  isFeatured: true,
  name: true,
  rentalUnit: true,
  shortDescription: true,
  slug: true,
  specifications: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
  },
  updatedAt: true,
} satisfies Prisma.ProductSelect;

type SelectedCategory = Prisma.CategoryGetPayload<{
  select: typeof categorySelect;
}>;
type SelectedProduct = Prisma.ProductGetPayload<{
  select: typeof productSelect;
}>;

function mapAdminCategory(category: SelectedCategory): AdminCategoryResponse {
  return {
    createdAt: category.createdAt.toISOString(),
    description: category.description,
    id: category.id,
    isActive: category.isActive,
    name: category.name,
    productCount: category._count.products,
    slug: category.slug,
    sortOrder: category.sortOrder,
    updatedAt: category.updatedAt.toISOString(),
  };
}

function mapAdminProduct(product: SelectedProduct): AdminProductResponse {
  return {
    category: product.category,
    categoryId: product.categoryId,
    createdAt: product.createdAt.toISOString(),
    description: product.description,
    id: product.id,
    images: product.images.map((image) => ({
      altText: image.altText,
      createdAt: image.createdAt.toISOString(),
      id: image.id,
      isPrimary: image.isPrimary,
      sortOrder: image.sortOrder,
      url: image.url,
    })),
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    name: product.name,
    rentalUnit: product.rentalUnit,
    shortDescription: product.shortDescription,
    slug: product.slug,
    specifications: product.specifications.map(
      ({ id, label, sortOrder, value }) => ({ id, label, sortOrder, value }),
    ),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function mapPublicCategory(category: {
  description: string | null;
  name: string;
  slug: string;
}): PublicCategoryResponse {
  return {
    description: category.description,
    name: category.name,
    slug: category.slug,
  };
}

function mapPublicSummary(
  product: SelectedProduct,
): PublicProductSummaryResponse {
  return {
    category: mapPublicCategory(product.category),
    images: product.images.map(({ altText, isPrimary, url }) => ({
      altText,
      isPrimary,
      url,
    })),
    isFeatured: product.isFeatured,
    name: product.name,
    rentalUnit: product.rentalUnit,
    shortDescription: product.shortDescription,
    slug: product.slug,
  };
}

@Injectable()
export class CatalogueService {
  constructor(private readonly repository: CatalogueRepository) {}

  async listAdminCategories(
    query: CategoryListQuery,
  ): Promise<PaginatedResponse<AdminCategoryResponse>> {
    const where: Prisma.CategoryWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const orderBy = [
      { [query.sortBy]: query.sortDirection },
      { id: 'asc' },
    ] as Prisma.CategoryOrderByWithRelationInput[];
    const [total, items] = await this.repository.prisma.$transaction([
      this.repository.prisma.category.count({ where }),
      this.repository.prisma.category.findMany({
        select: categorySelect,
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return this.page(
      items.map(mapAdminCategory),
      query.page,
      query.pageSize,
      total,
    );
  }

  async getAdminCategory(id: string) {
    const category = await this.repository.prisma.category.findUnique({
      select: categorySelect,
      where: { id },
    });
    if (!category) throw new NotFoundException('Category not found');
    return mapAdminCategory(category);
  }

  async createCategory(input: CreateCategoryInput) {
    try {
      const category = await this.repository.prisma.category.create({
        select: categorySelect,
        data: input,
      });
      return mapAdminCategory(category);
    } catch (error) {
      this.rethrowConflict(error, 'Category slug already exists');
    }
  }

  async updateCategory(id: string, input: UpdateCategoryInput) {
    await this.getAdminCategory(id);
    const category = await this.repository.prisma.category.update({
      select: categorySelect,
      where: { id },
      data: input,
    });
    return mapAdminCategory(category);
  }

  async deactivateCategory(id: string) {
    await this.repository.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CATALOGUE_MUTATION_LOCK})`;
      const category = await tx.category.findUnique({ where: { id } });
      if (!category) throw new NotFoundException('Category not found');
      const activeProducts = await tx.product.count({
        where: { categoryId: id, isActive: true },
      });
      if (activeProducts > 0)
        throw new ConflictException(
          'Deactivate active products before deactivating this category',
        );
      await tx.category.update({ where: { id }, data: { isActive: false } });
    });
    return this.getAdminCategory(id);
  }

  async activateCategory(id: string) {
    await this.repository.prisma.category
      .update({ where: { id }, data: { isActive: true } })
      .catch((error) => {
        if (this.code(error) === 'P2025')
          throw new NotFoundException('Category not found');
        throw error;
      });
    return this.getAdminCategory(id);
  }

  async listAdminProducts(
    query: ProductListQuery,
  ): Promise<PaginatedResponse<AdminProductResponse>> {
    const where = this.productWhere(query, false);
    const orderBy = [
      { [query.sortBy]: query.sortDirection },
      { id: 'asc' },
    ] as Prisma.ProductOrderByWithRelationInput[];
    const [total, items] = await this.repository.prisma.$transaction([
      this.repository.prisma.product.count({ where }),
      this.repository.prisma.product.findMany({
        select: productSelect,
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return this.page(
      items.map(mapAdminProduct),
      query.page,
      query.pageSize,
      total,
    );
  }

  async getAdminProduct(id: string) {
    const product = await this.repository.prisma.product.findUnique({
      select: productSelect,
      where: { id },
    });
    if (!product) throw new NotFoundException('Product not found');
    return mapAdminProduct(product);
  }

  async createProduct(input: CreateProductInput) {
    try {
      const id = await this.repository.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CATALOGUE_MUTATION_LOCK})`;
        const category = await tx.category.findUnique({
          where: { id: input.categoryId },
        });
        if (!category) throw new NotFoundException('Category not found');
        if (input.isActive && !category.isActive)
          throw new ConflictException(
            'An active product requires an active category',
          );
        const product = await tx.product.create({
          data: this.createProductData(input),
        });
        return product.id;
      });
      return this.getAdminProduct(id);
    } catch (error) {
      this.rethrowConflict(error, 'Product slug already exists');
    }
  }

  async updateProduct(id: string, input: UpdateProductInput) {
    try {
      await this.repository.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CATALOGUE_MUTATION_LOCK})`;
        const current = await tx.product.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Product not found');
        const category = await tx.category.findUnique({
          where: { id: input.categoryId },
        });
        if (!category) throw new NotFoundException('Category not found');
        if (current.isActive && !category.isActive)
          throw new ConflictException(
            'An active product requires an active category',
          );
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productSpecification.deleteMany({ where: { productId: id } });
        await tx.product.update({
          where: { id },
          data: this.updateProductData(input),
        });
      });
      return this.getAdminProduct(id);
    } catch (error) {
      this.rethrowConflict(
        error,
        'Product update conflicts with existing catalogue data',
      );
    }
  }

  async deactivateProduct(id: string) {
    return this.setProductActive(id, false);
  }

  async activateProduct(id: string) {
    return this.setProductActive(id, true);
  }

  async listPublicCategories(
    query: CategoryListQuery,
  ): Promise<PaginatedResponse<PublicCategoryResponse>> {
    const where: Prisma.CategoryWhereInput = {
      isActive: true,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [total, items] = await this.repository.prisma.$transaction([
      this.repository.prisma.category.count({ where }),
      this.repository.prisma.category.findMany({
        where,
        select: { description: true, name: true, slug: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return this.page(
      items.map(mapPublicCategory),
      query.page,
      query.pageSize,
      total,
    );
  }

  async getPublicCategory(slug: string) {
    const category = await this.repository.prisma.category.findFirst({
      where: { slug, isActive: true },
      select: { description: true, name: true, slug: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    return mapPublicCategory(category);
  }

  async listPublicProducts(
    query: ProductListQuery,
  ): Promise<PaginatedResponse<PublicProductSummaryResponse>> {
    const where = this.productWhere(query, true);
    const [total, items] = await this.repository.prisma.$transaction([
      this.repository.prisma.product.count({ where }),
      this.repository.prisma.product.findMany({
        select: productSelect,
        where,
        orderBy: [{ [query.sortBy]: query.sortDirection }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return this.page(
      items.map(mapPublicSummary),
      query.page,
      query.pageSize,
      total,
    );
  }

  async getPublicProduct(
    categorySlug: string,
    productSlug: string,
  ): Promise<PublicProductDetailResponse> {
    const product = await this.repository.prisma.product.findFirst({
      select: productSelect,
      where: {
        slug: productSlug,
        isActive: true,
        category: { slug: categorySlug, isActive: true },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return {
      ...mapPublicSummary(product),
      description: product.description,
      specifications: product.specifications.map(({ label, value }) => ({
        label,
        value,
      })),
    };
  }

  private productWhere(
    query: ProductListQuery,
    publicOnly: boolean,
  ): Prisma.ProductWhereInput {
    return {
      ...(publicOnly
        ? {
            isActive: true,
            category: {
              isActive: true,
              ...(query.categorySlug ? { slug: query.categorySlug } : {}),
            },
          }
        : {
            ...(query.isActive === undefined
              ? {}
              : { isActive: query.isActive }),
            ...(query.categorySlug
              ? { category: { slug: query.categorySlug } }
              : {}),
          }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isFeatured === undefined
        ? {}
        : { isFeatured: query.isFeatured }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              {
                shortDescription: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
  }

  private productChildren(input: CreateProductInput | UpdateProductInput) {
    return {
      images: {
        create: input.images.map((image, sortOrder) => ({
          ...image,
          sortOrder,
        })),
      },
      specifications: {
        create: input.specifications.map((specification, sortOrder) => ({
          ...specification,
          sortOrder,
        })),
      },
    };
  }

  private createProductData(
    input: CreateProductInput,
  ): Prisma.ProductCreateInput {
    return {
      category: { connect: { id: input.categoryId } },
      description: input.description ?? null,
      isActive: input.isActive,
      isFeatured: input.isFeatured,
      name: input.name,
      rentalUnit: input.rentalUnit,
      shortDescription: input.shortDescription,
      slug: input.slug,
      ...this.productChildren(input),
    };
  }

  private updateProductData(
    input: UpdateProductInput,
  ): Prisma.ProductUpdateInput {
    return {
      category: { connect: { id: input.categoryId } },
      description: input.description ?? null,
      isFeatured: input.isFeatured,
      name: input.name,
      rentalUnit: input.rentalUnit,
      shortDescription: input.shortDescription,
      ...this.productChildren(input),
    };
  }

  private async setProductActive(id: string, isActive: boolean) {
    await this.repository.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CATALOGUE_MUTATION_LOCK})`;
      const product = await tx.product.findUnique({
        include: { category: true },
        where: { id },
      });
      if (!product) throw new NotFoundException('Product not found');
      if (isActive && !product.category.isActive)
        throw new ConflictException(
          'An active product requires an active category',
        );
      await tx.product.update({ where: { id }, data: { isActive } });
    });
    return this.getAdminProduct(id);
  }

  private page<T>(
    items: T[],
    page: number,
    pageSize: number,
    total: number,
  ): PaginatedResponse<T> {
    return {
      items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  private code(error: unknown): string | undefined {
    return typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
      ? error.code
      : undefined;
  }

  private rethrowConflict(error: unknown, message: string): never {
    if (this.code(error) === 'P2002') throw new ConflictException(message);
    throw error;
  }
}
