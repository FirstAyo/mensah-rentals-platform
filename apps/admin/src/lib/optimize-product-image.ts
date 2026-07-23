import { PRODUCT_IMAGE_LIMITS } from '@mensah-rentals/validation';

export function containedDimensions(width: number, height: number) {
  const scale = Math.min(
    1,
    PRODUCT_IMAGE_LIMITS.maxDimension / Math.max(width, height),
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function optimizeProductImage(file: File) {
  if (
    !(PRODUCT_IMAGE_LIMITS.allowedMimeTypes as readonly string[]).includes(
      file.type,
    )
  )
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (file.size > PRODUCT_IMAGE_LIMITS.maxSourceBytes)
    throw new Error('Choose an image no larger than 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const dimensions = containedDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable.');
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    for (const quality of [0.82, 0.75, 0.65]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', quality),
      );
      if (blob && blob.size <= PRODUCT_IMAGE_LIMITS.maxProcessedBytes)
        return new File(
          [blob],
          `${file.name.replace(/\.[^.]+$/, '') || 'product'}.webp`,
          { type: 'image/webp' },
        );
    }
    throw new Error(
      'This image is still too large after optimization. Please choose a different image.',
    );
  } finally {
    bitmap.close();
  }
}
