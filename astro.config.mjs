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
