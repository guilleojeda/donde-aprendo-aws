import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'public', 'assets');
const exports = [
  { source: 'site-favicon.svg', destination: 'site-favicon.png', width: 120, height: 120 },
  { source: 'site-social.svg', destination: 'site-social.png', width: 1200, height: 630 },
  ...['fundamentos', 'certificacion', 'practica', 'serverless-desarrollo', 'seguridad', 'datos-ia'].map((family) => ({
    source: `editorial/${family}.svg`,
    destination: `blog/editorial-${family}.png`,
    width: 1200,
    height: 630,
  })),
];

for (const asset of exports) {
  const result = await sharp(path.join(assets, asset.source))
    .resize(asset.width, asset.height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toFile(path.join(assets, asset.destination));

  if (result.width !== asset.width || result.height !== asset.height) {
    throw new Error(
      `${asset.destination} is ${result.width}x${result.height}; expected ${asset.width}x${asset.height}`,
    );
  }
}
