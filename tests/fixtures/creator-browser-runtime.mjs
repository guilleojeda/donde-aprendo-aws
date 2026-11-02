const RUNTIME_KEY = Symbol.for('donde-aprendo-aws.creator-browser-runtime');

function currentRuntime() {
  const value = globalThis[RUNTIME_KEY];
  if (!value) throw new Error('The creator browser fixture runtime is not published in this worker.');
  return value;
}

export function bindCreatorBrowserRuntime(value) {
  if (!value || typeof value !== 'object') throw new TypeError('A browser fixture runtime object is required.');
  if (globalThis[RUNTIME_KEY]) throw new Error('A creator browser fixture runtime is already published.');
  globalThis[RUNTIME_KEY] = value;
}

export function getAccountAuth() {
  return currentRuntime().accountAuth;
}

export function getCreatorRuntime() {
  return currentRuntime().creatorRuntime;
}

export function clearCreatorBrowserRuntime(expected) {
  if (globalThis[RUNTIME_KEY] !== expected) throw new Error('The active creator browser runtime changed before cleanup.');
  delete globalThis[RUNTIME_KEY];
}
