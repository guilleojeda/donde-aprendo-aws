import assert from 'node:assert/strict';
import { COGNITO_DOMAIN } from '../fixtures/account-auth.mjs';
import { addCookie, expect, test } from '../fixtures/creator-browser-test.mjs';

const providerPath = '/oauth2/authorize';
const authorizationCode = 'browser-authorization-code';
const privateDetail = 'private-provider-detail';

async function startFrom(page, link, fixture) {
  const redirect = Promise.withResolvers();
  await page.route(`${fixture.origin}/cuenta/ingresar/`, async (route) => {
    try {
      const response = await route.fetch({ maxRedirects: 0 });
      assert.equal(response.status(), 303);
      const location = response.headers().location;
      assert.ok(location);
      // Retain the binding cookie from the real endpoint and stop at the provider boundary.
      await route.fulfill({ response, status: 200, contentType: 'text/html',
        body: '<main>Proveedor de identidad de prueba</main>' });
      redirect.resolve(new URL(location));
    } catch (error) {
      redirect.reject(error);
      await route.abort();
    }
  }, { times: 1 });
  const [authorize] = await Promise.all([redirect.promise, link.press('Enter')]);
  assert.equal(authorize.origin, COGNITO_DOMAIN);
  assert.equal(authorize.pathname, providerPath);
  assert.equal(authorize.searchParams.get('redirect_uri'), `${fixture.origin}/cuenta/callback/`);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  const nonce = authorize.searchParams.get('nonce');
  const harness = fixture.accountHarness;
  harness.state.issuedNonce = nonce;
  harness.state.issuedAttempt = [...harness.store.attempts.values()].find((attempt) => attempt.nonce === nonce);
  harness.state.expectedCallbackCode = authorizationCode;
  assert.ok(harness.state.issuedAttempt, 'la ruta de ingreso guardó el nuevo intento');
  const state = authorize.searchParams.get('state');
  assert.ok(state);
  return state;
}

const accessFailures = [
  {
    state: 'acceso-invalido', status: 400, role: 'alert', title: 'No pudimos confirmar el acceso',
    returnParameters: () => ({ state: 'incorrecto', code: authorizationCode }),
  },
  {
    state: 'cancelado', status: 400, role: 'status', title: 'Cancelaste el acceso',
    returnParameters: (state) => ({ state, error: 'access_denied' }),
  },
  {
    state: 'no-disponible', status: 503, role: 'alert', title: /no pudimos.*(?:acceso|ingreso|sesi[oó]n)|inicio de sesi[oó]n.*no.*disponible/iu,
    returnParameters: (state) => ({ state, code: authorizationCode }),
  },
];

for (const failure of accessFailures) {
  test(`el retorno ${failure.state} tiene un aviso seguro en Cuenta y permite iniciar otro intento`, async ({ fixture, page }) => {
    await page.goto(`${fixture.origin}/cuenta/`);
    const state = await startFrom(page, page.getByRole('link', { name: 'Ingresar', exact: true }), fixture);
    const callback = new URL('/cuenta/callback/', fixture.origin);
    callback.search = new URLSearchParams({ ...failure.returnParameters(state), error_description: privateDetail });
    const oidc = fixture.accountHarness.state.oidc;
    if (failure.state === 'no-disponible') oidc.tokenStatus = 503;
    const response = await page.goto(callback.href);
    assert.equal(response.status(), failure.status);
    assert.match(response.headers()['cache-control'], /private.*no-store/iu);
    await expect(page).toHaveURL(`${fixture.origin}/cuenta/?estado=${failure.state}`);
    const main = page.getByRole('main');
    const notice = main.getByRole(failure.role, { name: failure.title });
    await expect(notice).toBeVisible();
    const html = await page.content();
    assert.equal(html.includes(privateDetail), false, 'la vista no refleja el diagnóstico del proveedor');
    assert.equal(html.includes(authorizationCode), false, 'la vista no refleja el código de autorización');
    assert.equal(fixture.accountStore.sessions.size, 0, 'el retorno fallido no crea una sesión');

    delete oidc.tokenStatus;
    const nextState = await startFrom(page, notice.getByRole('link', { name: /volver a ingresar|reintentar/i }), fixture);
    assert.notEqual(nextState, state, 'reintentar inicia otro acceso en lugar de repetir el callback');
    callback.search = new URLSearchParams({ state: nextState, code: authorizationCode });
    const accepted = await page.goto(callback.href);
    assert.equal(accepted.status(), 200);
    await expect(page).toHaveURL(`${fixture.origin}/cuenta/`);
    await expect(page.getByRole('heading', { name: 'Tu página', exact: true })).toBeVisible();
    assert.equal(fixture.accountStore.sessions.size, 1);
  });
}

test('si falla la lectura de una sesión, Reintentar recupera la cuenta en la misma sesión', async ({ fixture, page }) => {
  const cookie = await fixture.login();
  await addCookie(page.context(), fixture, cookie);
  fixture.accountStore.failNext('getSession', new Error(privateDetail));

  const unavailable = await page.goto(`${fixture.origin}/cuenta/`);
  assert.equal(unavailable.status(), 503);
  const notice = page.getByRole('main').getByRole('alert', { name: 'No pudimos cargar tu cuenta' });
  await expect(notice).toBeVisible();
  await expect(notice.getByText(privateDetail)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ingresar', exact: true })).toHaveCount(0);
  const recovered = page.waitForResponse((response) => response.request().isNavigationRequest()
    && response.url() === `${fixture.origin}/cuenta/`);
  await notice.getByRole('link', { name: 'Reintentar', exact: true }).press('Enter');
  assert.equal((await recovered).status(), 200);
  await expect(page.getByRole('heading', { name: 'Tu página', exact: true })).toBeVisible();
  assert.equal(fixture.accountStore.sessions.size, 1);
  assert.equal((await fixture.principal(cookie)).state, 'authenticated');
});
