import { test as base, expect } from '@playwright/test';
import { startContributionBrowserApp } from './contribution-browser-app.mjs';

const test = base.extend({
  app: [async ({}, use) => {
    const app = await startContributionBrowserApp();
    try {
      await use(app);
    } finally {
      await app.close();
    }
  }, { scope: 'worker' }],
  fixture: [async ({ app }, use) => {
    const fixture = await app.createFixture();
    try {
      await use(fixture);
    } finally {
      fixture.clear();
    }
  }, { auto: true }],
});

export { test, expect };
