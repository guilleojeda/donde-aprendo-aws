import { isCatalogResourceIdWithinLimit } from './catalog-identity.mjs';
import { validateCatalogUrl } from './catalog.mjs';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalidResource() {
  throw new Error('catalog resource facts are malformed');
}

/**
 * Validate the durable facts consumed by creator and public projections.
 *
 * This deliberately has no service/API error dependency. Callers at an HTTP
 * boundary decide whether a malformed row is a 503 or another domain error;
 * conversion and other non-HTTP consumers can use the same rule directly.
 */
export function creatorResourceFacts(resource, expectedId = resource?.id) {
  if (!isRecord(resource)
    || typeof expectedId !== 'string'
    || !isCatalogResourceIdWithinLimit(expectedId)
    || expectedId.startsWith('__')
    || resource.id !== expectedId
    || (resource.recordType !== undefined && resource.recordType !== 'event')) {
    invalidResource();
  }

  if (typeof resource.title !== 'string') invalidResource();
  if (Object.hasOwn(resource, 'description') && typeof resource.description !== 'string') invalidResource();
  if (Object.hasOwn(resource, 'hidden') && typeof resource.hidden !== 'boolean') invalidResource();
  if (Object.hasOwn(resource, 'published') && typeof resource.published !== 'boolean') invalidResource();
  if (Object.hasOwn(resource, 'approvalRevoked') && typeof resource.approvalRevoked !== 'boolean') invalidResource();

  const url = resource.recordType === 'event' ? resource.registrationUrl : resource.url;
  if (typeof url !== 'string') invalidResource();
  try {
    validateCatalogUrl(url);
  } catch {
    invalidResource();
  }

  const version = resource.version === undefined ? 0 : resource.version;
  if (!Number.isSafeInteger(version) || version < 0) invalidResource();

  let directoryApproval = 'pending';
  if (resource.approvalRevoked === true) directoryApproval = 'revoked';
  else if (resource.published === true) directoryApproval = 'approved';
  else if (resource.published === false || resource.published === undefined) directoryApproval = 'pending';
  else invalidResource();

  return { url, version, directoryApproval };
}

