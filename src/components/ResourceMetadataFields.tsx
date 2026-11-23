import type { TargetedEvent } from 'preact';
import {
  RESOURCE_METADATA_POLICIES,
  type ResourceMetadataField,
  type ResourceMetadataPolicy,
  type ResourceMetadataPolicyName,
} from '../lib/resource-form-policy.mjs';

export interface ResourceMetadataValues {
  title: string;
  url: string;
  description: string;
}

export type ResourceMetadataErrors = Partial<Record<ResourceMetadataField, string>>;

export interface ResourceMetadataFieldsProps {
  idPrefix: string;
  values: ResourceMetadataValues;
  policy?: ResourceMetadataPolicy | ResourceMetadataPolicyName;
  errors?: ResourceMetadataErrors;
  disabled?: boolean;
  readOnly?: boolean;
  helpId?: string;
  hookPrefix?: string;
  titleLabel?: string;
  descriptionLabel?: string;
  titlePlaceholder?: string;
  descriptionPlaceholder?: string;
  titleAutoComplete?: string;
  urlAutoComplete?: string;
  titleId?: string;
  urlId?: string;
  descriptionId?: string;
  onChange?: (field: ResourceMetadataField, value: string) => void;
  onInput?: (field: ResourceMetadataField) => void;
  onInvalid?: (field: ResourceMetadataField, event: Event) => void;
}

function policyValue(policy: ResourceMetadataFieldsProps['policy']): ResourceMetadataPolicy {
  return typeof policy === 'string'
    ? RESOURCE_METADATA_POLICIES[policy]
    : policy ?? RESOURCE_METADATA_POLICIES.owner;
}

function describedBy(helpId: string | undefined, errorId: string, error?: string): string | undefined {
  const values = [helpId, error ? errorId : undefined].filter(Boolean);
  return values.length > 0 ? values.join(' ') : undefined;
}

function valueHandler(
  onChange: ResourceMetadataFieldsProps['onChange'],
  field: ResourceMetadataField,
): ((event: TargetedEvent<HTMLInputElement | HTMLTextAreaElement>) => void) | undefined {
  return onChange
    ? (event: TargetedEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(field, event.currentTarget.value)
    : undefined;
}

export default function ResourceMetadataFields({
  idPrefix,
  values,
  policy: requestedPolicy,
  errors = {},
  disabled = false,
  readOnly = false,
  helpId,
  hookPrefix,
  titleLabel = 'Título',
  descriptionLabel = 'Descripción',
  titlePlaceholder,
  descriptionPlaceholder,
  titleAutoComplete = 'off',
  urlAutoComplete = 'url',
  titleId,
  urlId,
  descriptionId,
  onChange,
  onInput,
  onInvalid,
}: ResourceMetadataFieldsProps) {
  const policy = policyValue(requestedPolicy);
  const titleControlId = titleId ?? (requestedPolicy && typeof requestedPolicy === 'string' && requestedPolicy === 'public'
    ? `${idPrefix}-title-field` : `${idPrefix}-title`);
  const urlControlId = urlId ?? `${idPrefix}-url`;
  const descriptionControlId = descriptionId ?? `${idPrefix}-description`;
  const titleErrorId = `${titleControlId}-error`;
  const urlErrorId = `${urlControlId}-error`;
  const descriptionErrorId = `${descriptionControlId}-error`;
  const error = (field: ResourceMetadataField): string | undefined => errors[field];
  const errorHook = hookPrefix ? `data-${hookPrefix}-error` : undefined;

  return <>
    <div className="resource-metadata-fields__field" data-resource-metadata-field="title">
      <label htmlFor={titleControlId}>{titleLabel}</label>
      <input id={titleControlId} name="title" type="text" autoComplete={titleAutoComplete}
        placeholder={titlePlaceholder} maxLength={policy.title.maxLength} required={policy.title.required}
        value={values.title} disabled={disabled} readOnly={readOnly}
        aria-invalid={error('title') ? 'true' : undefined}
        aria-describedby={describedBy(helpId, titleErrorId, error('title'))}
        onInvalid={(event) => onInvalid?.('title', event)}
        onInput={(event) => { onInput?.('title'); valueHandler(onChange, 'title')?.(event); }} />
      <span className="resource-metadata-fields__error" id={titleErrorId} data-resource-metadata-error="title" {...(errorHook ? { [errorHook]: 'title' } : {})} hidden={!error('title')}>{error('title')}</span>
    </div>

    <div className="resource-metadata-fields__field resource-metadata-fields__field--full" data-resource-metadata-field="url">
      <label htmlFor={urlControlId}>URL</label>
      <input id={urlControlId} name="url" type="url" inputMode="url" autoComplete={urlAutoComplete}
        maxLength={policy.url.maxLength} required={policy.url.required} value={values.url}
        disabled={disabled} readOnly={readOnly} aria-invalid={error('url') ? 'true' : undefined}
        aria-describedby={describedBy(helpId, urlErrorId, error('url'))}
        onInvalid={(event) => onInvalid?.('url', event)}
        onInput={(event) => { onInput?.('url'); valueHandler(onChange, 'url')?.(event); }} />
      <span className="resource-metadata-fields__error" id={urlErrorId} data-resource-metadata-error="url" {...(errorHook ? { [errorHook]: 'url' } : {})} hidden={!error('url')}>{error('url')}</span>
    </div>

    <div className="resource-metadata-fields__field resource-metadata-fields__field--full" data-resource-metadata-field="description">
      <label htmlFor={descriptionControlId}>{descriptionLabel}{!policy.description.required && <span> (opcional)</span>}</label>
      <textarea id={descriptionControlId} name="text" rows={5} placeholder={descriptionPlaceholder}
        maxLength={policy.description.maxLength} required={policy.description.required} value={values.description}
        disabled={disabled} readOnly={readOnly} aria-invalid={error('description') ? 'true' : undefined}
        aria-describedby={describedBy(helpId, descriptionErrorId, error('description'))}
        onInvalid={(event) => onInvalid?.('description', event)}
        onInput={(event) => { onInput?.('description'); valueHandler(onChange, 'description')?.(event); }} />
      <span className="resource-metadata-fields__error" id={descriptionErrorId} data-resource-metadata-error="description" {...(errorHook ? { [errorHook]: 'description' } : {})} hidden={!error('description')}>{error('description')}</span>
    </div>
  </>;
}

