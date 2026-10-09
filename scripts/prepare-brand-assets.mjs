import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const sharp = require('sharp');

const sourceRoot = process.argv[2];
if (!sourceRoot)
  throw new Error('Pass the folder containing the approved logo screenshots.');

const variants = [
  ['Screenshot 2026-10-04 024421.png', 'logo-light.png', 'light'],
  ['Screenshot 2026-10-04 024445.png', 'logo-dark.png', 'dark'],
  ['Screenshot 2026-10-04 024431.png', 'symbol-light.png', 'light'],
  ['Screenshot 2026-10-04 024456.png', 'symbol-dark.png', 'dark'],
];

async function transparentAsset(source, output, theme) {
  const { data, info } = await sharp(source)
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Buffer.alloc(info.width * info.height * 4);
  for (let index = 0; index < data.length; index += 1) {
    const alpha = theme === 'light' ? 255 - data[index] : data[index];
    const offset = index * 4;
    pixels[offset] = theme === 'light' ? 0 : 255;
    pixels[offset + 1] = theme === 'light' ? 0 : 255;
    pixels[offset + 2] = theme === 'light' ? 0 : 255;
    pixels[offset + 3] = alpha;
  }
  await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(output);
}

for (const app of ['web', 'admin']) {
  const destination = path.join('apps', app, 'public', 'brand');
  await mkdir(destination, { recursive: true });
  for (const [sourceName, outputName, theme] of variants)
    await transparentAsset(
      path.join(sourceRoot, sourceName),
      path.join(destination, outputName),
      theme,
    );
}

for (const [name, size] of [
  ['favicon-32.png', 32],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  await sharp(path.join('apps', 'web', 'public', 'brand', 'symbol-light.png'))
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(path.join('apps', 'web', 'public', 'brand', name));
}
