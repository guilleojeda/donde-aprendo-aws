import { defineConfig } from 'astro/config';
import { responsiveImagesIntegration } from './src/lib/responsive-images.mjs';

export default defineConfig({
  integrations: [responsiveImagesIntegration()],
  markdown: {
    shikiConfig: {
      theme: 'css-variables',
    },
  },
  site: 'https://dondeaprendoaws.com',
  output: 'static',
  trailingSlash: 'always',
});
