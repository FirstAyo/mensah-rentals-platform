import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  cuidParamSchema,
  productImageUploadMetadataSchema,
  PRODUCT_IMAGE_LIMITS,
  updateProductImageSchema,
  type UpdateProductImageInput,
} from '@mensah-rentals/validation';
import { memoryStorage } from 'multer';

import { Public } from '../auth/public.decorator';
import { AllowMultipart } from '../auth/origin.guard';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { ProductMediaService } from './product-media.service';

@Controller('admin/products/:productId/images')
export class AdminProductMediaController {
  constructor(private readonly media: ProductMediaService) {}

  @Post()
  @RequirePermissions('product.update')
  @AllowMultipart()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: PRODUCT_IMAGE_LIMITS.maxSourceBytes, files: 1 },
    }),
  )
  upload(
    @Param('productId', new ZodBodyPipe(cuidParamSchema)) productId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodBodyPipe(productImageUploadMetadataSchema))
    body: { altText: string },
  ) {
    if (!file?.buffer) throw new BadRequestException('Image file is required');
    return this.media.upload(productId, file.buffer, body.altText);
  }

  @Put(':imageId')
  @RequirePermissions('product.update')
  update(
    @Param('productId', new ZodBodyPipe(cuidParamSchema)) productId: string,
    @Param('imageId', new ZodBodyPipe(cuidParamSchema)) imageId: string,
    @Body(new ZodBodyPipe(updateProductImageSchema))
    input: UpdateProductImageInput,
  ) {
    return this.media.update(productId, imageId, input);
  }

  @Delete(':imageId')
  @RequirePermissions('product.update')
  remove(
    @Param('productId', new ZodBodyPipe(cuidParamSchema)) productId: string,
    @Param('imageId', new ZodBodyPipe(cuidParamSchema)) imageId: string,
  ) {
    return this.media.remove(productId, imageId);
  }
}

@Controller('media/products')
export class PublicProductMediaController {
  constructor(private readonly media: ProductMediaService) {}

  @Public()
  @Get(':productId/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('Content-Type', 'image/webp')
  async image(
    @Param('productId', new ZodBodyPipe(cuidParamSchema)) productId: string,
    @Param('filename') filename: string,
  ) {
    return new StreamableFile(await this.media.read(productId, filename));
  }
}
