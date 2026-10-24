import { defineConfig } from 'astro/config';
import awsAmplify from 'astro-aws-amplify';
import { allowedAmplifyDomains } from './src/lib/amplify-security.mjs';
import { responsiveImagesIntegration } from './src/lib/responsive-images.mjs';

export default defineConfig({
  integrations: [responsiveImagesIntegration()],
  adapter: awsAmplify({
    runtime: 'nodejs24.x',
    runtimeEnv: [
      'ACCOUNT_ORIGIN',
      'COGNITO_ISSUER',
      'COGNITO_CLIENT_ID',
      'COGNITO_DOMAIN',
      'ACCOUNTS_TABLE',
      'CATALOG_TABLE',
      'CREATOR_PROFILES_TABLE',
      'CREATOR_PHOTOS_BUCKET',
      'GA4_PROPERTY_ID',
      'GA4_CREDENTIALS_SECRET_ARN',
      'CREATOR_ANALYTICS_CAPTURE_STARTED_AT',
    ],
  }),
  markdown: {
    shikiConfig: {
      theme: 'css-variables',
    },
  },
  site: 'https://dondeaprendoaws.com',
  output: 'static',
  security: {
    allowedDomains: allowedAmplifyDomains,
  },
  trailingSlash: 'always',
});
