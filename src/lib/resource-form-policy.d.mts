export type ResourceKind = keyof typeof import('./resource-taxonomy.mjs').KIND_LABELS;
export type ResourceFormat = string;
export type ResourceTopic = string;
export type ResourceMetadataField = 'title' | 'url' | 'description';
export type ResourceMetadataPolicyName = 'public' | 'owner';

export interface ResourceMetadataFieldPolicy {
  maxLength: number;
  required: boolean;
}

export interface ResourceMetadataPolicy {
  title: ResourceMetadataFieldPolicy;
  url: ResourceMetadataFieldPolicy;
  description: ResourceMetadataFieldPolicy;
}

export const RESOURCE_METADATA_POLICIES: Readonly<Record<ResourceMetadataPolicyName, ResourceMetadataPolicy>>;
export const RESOURCE_CLASSIFICATION_LIMITS: Readonly<{ maxTopics: number }>;
export function formatsForKind(kind: string): readonly string[];
export function isResourceKind(value: string): value is ResourceKind;
export function isResourceFormat(value: string): value is ResourceFormat;
export function isResourceTopic(value: string): value is ResourceTopic;

export interface ResourceClassificationValue {
  kind: string;
  format: string;
  topics: string[];
}

export type ResourceClassificationChange =
  | { type: 'kind'; value: string }
  | { type: 'format'; value: string }
  | { type: 'topic'; value: string; checked: boolean };

export interface ResourceClassificationTransition {
  value: ResourceClassificationValue;
  accepted: boolean;
  rejectedField?: 'topics';
}

export function transitionResourceClassification(
  current: ResourceClassificationValue,
  change: ResourceClassificationChange,
): ResourceClassificationTransition;

export function validateResourceClassification(value: ResourceClassificationValue):
  | { valid: true; value: ResourceClassificationValue }
  | { valid: false; field: 'kind-format' | 'topics'; reason: 'required' | 'invalid_combination' | 'invalid_option' };

export const FORMATS_BY_KIND: typeof import('./resource-taxonomy.mjs').FORMATS_BY_KIND;
export const KIND_LABELS: typeof import('./resource-taxonomy.mjs').KIND_LABELS;
export const TOPICS: typeof import('./resource-taxonomy.mjs').TOPICS;
