type ResourceCopy = Record<string, unknown>;

function resourceIdentity(value: unknown): ResourceCopy | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ResourceCopy
    : undefined;
}

function sameResourceCopy(left: ResourceCopy, right: ResourceCopy): boolean {
  return left.version === right.version
    && left.title === right.title
    && left.url === right.url
    && Object.hasOwn(left, 'description') === Object.hasOwn(right, 'description')
    && left.description === right.description;
}

/** Compare only repeated resource fields shared by the owner's link projections. */
export function creatorResourceProjectionsAgree(
  links: readonly unknown[],
  editableResources: readonly unknown[],
): boolean {
  const byId = new Map<string, ResourceCopy>();
  const add = (id: unknown, copy: ResourceCopy, versionKey: 'resourceVersion' | 'version') => {
    if (typeof id !== 'string' || id.length === 0) return false;
    const normalized = {
      version: copy[versionKey],
      title: copy.title,
      url: copy.url,
      ...(Object.hasOwn(copy, 'description') ? { description: copy.description } : {}),
    };
    const prior = byId.get(id);
    if (prior && !sameResourceCopy(prior, normalized)) return false;
    byId.set(id, normalized);
    return true;
  };

  for (const value of links) {
    const link = resourceIdentity(value);
    if (!link || !add(link.resourceId, link, 'resourceVersion')) return false;
  }
  for (const value of editableResources) {
    const resource = resourceIdentity(value);
    if (!resource || !add(resource.id, resource, 'version')) return false;
  }
  return true;
}
