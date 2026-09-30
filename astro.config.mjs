import { defineConfig } from 'astro/config';
import { responsiveImagesIntegration } from './src/lib/responsive-images.mjs';

export default defineConfig({
  integrations: [responsiveImagesIntegration()],
  site: 'https://dondeaprendoaws.com',
  output: 'static',
  trailingSlash: 'always',
});
