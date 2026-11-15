export function validateCatalogUrl(url, index = 0) {
  if (typeof url !== 'string' || url.length === 0 || url.trim() !== url || /[\u0000-\u001f\u007f]/.test(url)) {
    throw new Error(`Catalog record ${index + 1} has an invalid URL`);
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error(`Catalog record ${index + 1} has an invalid URL`, { cause: error });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`Catalog record ${index + 1} has an unsafe URL`);
  }
  return url;
}

/** Check a received literal URL without changing its identity. */
export function isSafeCatalogUrl(value) {
  try {
    validateCatalogUrl(value);
    return true;
  } catch {
    return false;
  }
}
