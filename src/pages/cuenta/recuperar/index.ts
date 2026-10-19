import type { APIRoute } from 'astro';
import { createAccountRoute } from '../_account-route';

export const prerender = false;

export const ALL: APIRoute = createAccountRoute('account-page');
