import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@mensah-rentals/database';
import type {
  AdminCategoryResponse,
  AdminProductResponse,
  DeleteCategoryResponse,
  PaginatedResponse,
  PublicCategoryResponse,
  PublicProductDetailResponse,
  PublicProductSummaryResponse,
} from '@mensah-rentals/types';
import type {
  CategoryListQuery,
  CreateCategoryInput,
  CreateProductInput,
  DeleteCategoryInput,
  ProductListQuery,
  PublicCategoryListQuery,
  PublicProductListQuery,
  UpdateCategoryInput,
  UpdateProductInput,
} from '@mensah-rentals/validation';

import { CatalogueRepository } from './catalogue.repository';
import { ProductMediaService } from '../media/product-media.service';

const CATALOGUE_MUTATION_LOCK = 2_026_071_814;

const categorySelect = {
  _count: { select: { products: { where: { deletedAt: null } } } },
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

const publicProductSummarySelect = {
  category: { select: { description: true, name: true, slug: true } },
  images: {
    select: { altText: true, isPrimary: true, url: true },
    orderBy: [
      { isPrimary: 'desc' as const },
      { sortOrder: 'asc' as const },
      { id: 'asc' as const },
    ],
    take: 1,
  },
  isFeatured: true,
  name: true,
  rentalUnit: true,
  shortDescription: true,
  slug: true,
} satisfies Prisma.ProductSelect;

const publicProductDetailSelect = {
  ...publicProductSummarySelect,
  description: true,
  images: {
    select: { altText: true, isPrimary: true, url: true },
    orderBy: [
      { isPrimary: 'desc' as const },
      { sortOrder: 'asc' as const },
      { id: 'asc' as const },
    ],
    take: 4,
  },
  specifications: {
    select: { label: true, value: true },
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.ProductSelect;

type SelectedCategory = Prisma.CategoryGetPayload<{
  select: typeof categorySelect;
}>;
type SelectedProduct = Prisma.ProductGetPayload<{
  select: typeof productSelect;
}>;
type PublicSelectedSummary = Prisma.ProductGetPayload<{
  select: typeof publicProductSummarySelect;
}>;
type PublicSelectedDetail = Prisma.ProductGetPayload<{
  select: typeof publicProductDetailSelect;
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
  product: PublicSelectedSummary | PublicSelectedDetail,
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
  constructor(
    private readonly repository: CatalogueRepository,
    private readonly media: ProductMediaService,
  ) {}

  async listAdminCategories(
    query: CategoryListQuery,
  ): Promise<PaginatedResponse<AdminCategoryResponse>> {
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
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
    const category = await this.repository.prisma.category.findFirst({
      select: categorySelect,
      where: { id, deletedAt: null },
    });
    if (!category) throw new NotFoundException('Category not found');
    return mapAdminCategory(category);
  }

  async createCategory(input: CreateCategoryInput) {
    try {
      const category = await this.repository.prisma.category.create({
        select: categorySelect,
        data: { ...input, slug: input.slug.trim().toLowerCase() },
      });
      return mapAdminCategory(category);
    } catch (error) {
      this.rethrowConflict(error, 'That category slug is already in use.');
    }
  }

  async updateCategory(id: string, input: UpdateCategoryInput) {
    await this.getAdminCategory(id);
    try {
      const category = await this.repository.prisma.category.update({
        select: categorySelect,
        where: { id },
        data: { ...input, slug: input.slug.trim().toLowerCase() },
      });
      return mapAdminCategory(category);
    } catch (error) {
      this.rethrowConflict(error, 'That category slug is already in use.');
    }
  }

  async deactivateCategory(id: string) {
    await this.repository.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CATALOGUE_MUTATION_LOCK})`;
      const category = await tx.category.findFirst({
        where: { id, deletedAt: null },
      });
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

  async deleteCategory(
    id: string,
    input: DeleteCategoryInput,
  ): Promise<DeleteCategoryResponse> {
    const outcome = await this.repository.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CATALOGUE_MUTATION_LOCK})`;
      const category = await tx.category.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!category) throw new NotFoundException('Category not found');

      await tx.$queryRaw`SELECT id FROM "Product" WHERE "categoryId" = ${id} AND "deletedAt" IS NULL FOR UPDATE`;
      const products = await tx.product.findMany({
        where: { categoryId: id, deletedAt: null },
        select: {
          id: true,
          images: { select: { url: true } },
          inventory: {
            select: {
              id: true,
              _count: {
                select: {
                  items: true,
                  reservationItems: true,
                  transactions: true,
                },
              },
            },
          },
          _count: {
            select: {
              rentalChangeRequestItems: true,
              rentalRequestItems: true,
              rentalRequestRevisionItems: true,
            },
          },
        },
      });
      if (products.length > 0 && !input.confirmDeleteProducts)
        throw new ConflictException({
          code: 'CATEGORY_DELETE_CONFIRMATION_REQUIRED',
          message: `This category contains ${products.length} product${products.length === 1 ? '' : 's'}. Confirm deletion to continue.`,
          productCount: products.length,
          statusCode: 409,
        });

      const now = new Date();
      const mediaUrls: string[] = [];
      let hardDeletedProductCount = 0;
      let tombstonedProductCount = 0;
      for (const product of products) {
        const hasHistoricalProductReference =
          product._count.rentalRequestItems > 0 ||
          product._count.rentalRequestRevisionItems > 0 ||
          product._count.rentalChangeRequestItems > 0;
        const inventoryHasHistory = Boolean(
          product.inventory &&
            (product.inventory._count.items > 0 ||
              product.inventory._count.reservationItems > 0 ||
              product.inventory._count.transactions > 0),
        );
        await tx.cartItem.deleteMany({ where: { productId: product.id } });
        if (hasHistoricalProductReference || inventoryHasHistory) {
          await tx.product.update({
            where: { id: product.id },
            data: { deletedAt: now, isActive: false, isFeatured: false },
          });
          tombstonedProductCount += 1;
          continue;
        }
        if (product.inventory)
          await tx.inventory.delete({ where: { id: product.inventory.id } });
        mediaUrls.push(...product.images.map(({ url }) => url));
        await tx.product.delete({ where: { id: product.id } });
        hardDeletedProductCount += 1;
      }
      if (tombstonedProductCount > 0)
        await tx.category.update({
          where: { id },
          data: { deletedAt: now, isActive: false },
        });
      else await tx.category.delete({ where: { id } });

      return {
        mediaUrls,
        response: {
          categoryDeleted: true as const,
          hardDeletedProductCount,
          productsRemovedFromCatalogue: products.length,
          tombstonedProductCount,
        },
      };
    });
    await this.media.removeCommittedFiles(outcome.mediaUrls);
    return outcome.response;
  }

  async activateCategory(id: string) {
    await this.repository.prisma.category
      .update({ where: { id, deletedAt: null }, data: { isActive: true } })
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
    const where = this.productWhere(query);
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
    const product = await this.repository.prisma.product.findFirst({
      select: productSelect,
      where: { id, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');
    return mapAdminProduct(product);
  }

  async createProduct(input: CreateProductInput) {
    try {
      const id = await this.repository.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CATALOGUE_MUTATION_LOCK})`;
        const category = await tx.category.findFirst({
          where: { id: input.categoryId, deletedAt: null },
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
        const current = await tx.product.findFirst({
          where: { id, deletedAt: null },
        });
        if (!current) throw new NotFoundException('Product not found');
        const category = await tx.category.findFirst({
          where: { id: input.categoryId, deletedAt: null },
        });
        if (!category) throw new NotFoundException('Category not found');
        if (current.isActive && !category.isActive)
          throw new ConflictException(
            'An active product requires an active category',
          );
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
    query: PublicCategoryListQuery,
  ): Promise<PaginatedResponse<PublicCategoryResponse>> {
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
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
      where: { slug, isActive: true, deletedAt: null },
      select: { description: true, name: true, slug: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    return mapPublicCategory(category);
  }

  async listPublicProducts(
    query: PublicProductListQuery,
  ): Promise<PaginatedResponse<PublicProductSummaryResponse>> {
    const where = this.publicProductWhere(query);
    const [total, items] = await this.repository.prisma.$transaction([
      this.repository.prisma.product.count({ where }),
      this.repository.prisma.product.findMany({
        select: publicProductSummarySelect,
        where,
        orderBy: this.publicProductOrder(query.sort),
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
      select: publicProductDetailSelect,
      where: {
        slug: productSlug,
        isActive: true,
        deletedAt: null,
        category: { slug: categorySlug, isActive: true, deletedAt: null },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    const related = await this.repository.prisma.product.findMany({
      select: publicProductSummarySelect,
      where: {
        slug: { not: product.slug },
        isActive: true,
        deletedAt: null,
        category: {
          slug: product.category.slug,
          isActive: true,
          deletedAt: null,
        },
      },
      orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      take: 4,
    });
    return {
      ...mapPublicSummary(product),
      description: product.description,
      relatedProducts: related.map(mapPublicSummary),
      specifications: product.specifications.map(({ label, value }) => ({
        label,
        value,
      })),
    };
  }

  private productWhere(query: ProductListQuery): Prisma.ProductWhereInput {
    return {
      deletedAt: null,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.categorySlug ? { category: { slug: query.categorySlug } } : {}),
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

  private publicProductWhere(
    query: PublicProductListQuery,
  ): Prisma.ProductWhereInput {
    return {
      deletedAt: null,
      isActive: true,
      category: {
        deletedAt: null,
        isActive: true,
        ...(query.categorySlug ? { slug: query.categorySlug } : {}),
      },
      ...(query.isFeatured ? { isFeatured: true } : {}),
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
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                category: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
  }

  private publicProductOrder(
    sort: PublicProductListQuery['sort'],
  ): Prisma.ProductOrderByWithRelationInput[] {
    if (sort === 'name-asc') return [{ name: 'asc' }, { id: 'asc' }];
    if (sort === 'name-desc') return [{ name: 'desc' }, { id: 'asc' }];
    if (sort === 'newest')
      return [{ createdAt: 'desc' }, { name: 'asc' }, { id: 'asc' }];
    return [{ isFeatured: 'desc' }, { name: 'asc' }, { id: 'asc' }];
  }

  private productChildren(input: CreateProductInput | UpdateProductInput) {
    return {
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
      const product = await tx.product.findFirst({
        include: { category: true },
        where: { id, deletedAt: null },
      });
      if (!product) throw new NotFoundException('Product not found');
      if (
        isActive &&
        (!product.category.isActive || product.category.deletedAt)
      )
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
