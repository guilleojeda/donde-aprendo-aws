import type { JSX, TargetedEvent } from 'preact';
import {
  FORMATS_BY_KIND,
  KIND_LABELS,
  TOPICS,
  formatsForKind,
  type ResourceClassificationValue,
} from '../lib/resource-form-policy.mjs';

export interface ResourceClassificationErrors {
  kind?: string;
  format?: string;
  kindFormat?: string;
  topics?: string;
}

export interface ResourceClassificationFieldsProps {
  idPrefix: string;
  value?: Partial<ResourceClassificationValue>;
  errors?: ResourceClassificationErrors;
  disabled?: boolean;
  required?: boolean;
  preserveInvalidValues?: boolean;
  helpId?: string;
  kindLabel?: string;
  topicLegend?: JSX.Element | string;
  hookPrefix?: string;
  onKindChange?: (value: string) => void;
  onFormatChange?: (value: string) => void;
  onTopicChange?: (value: string, checked: boolean) => void;
  onKindInvalid?: (event: Event) => void;
  onFormatInvalid?: (event: Event) => void;
}

function describedBy(helpId: string | undefined, ...ids: Array<string | undefined>): string | undefined {
  const values = [helpId, ...ids].filter(Boolean);
  return values.length > 0 ? values.join(' ') : undefined;
}

function inputHandler(handler: ((value: string) => void) | undefined): ((event: TargetedEvent<HTMLSelectElement>) => void) | undefined {
  return handler ? (event: TargetedEvent<HTMLSelectElement>) => handler(event.currentTarget.value) : undefined;
}

export default function ResourceClassificationFields({
  idPrefix,
  value = {},
  errors = {},
  disabled = false,
  required = true,
  preserveInvalidValues = false,
  helpId,
  kindLabel = 'Tipo de recurso',
  topicLegend = <>Temas <span>(opcional, hasta tres)</span></>,
  hookPrefix,
  onKindChange,
  onFormatChange,
  onTopicChange,
  onKindInvalid,
  onFormatInvalid,
}: ResourceClassificationFieldsProps) {
  const kind = typeof value.kind === 'string' ? value.kind : '';
  const format = typeof value.format === 'string' ? value.format : '';
  const topics = Array.isArray(value.topics)
    ? value.topics.filter((topic: unknown): topic is string => typeof topic === 'string')
    : [];
  const kindId = `${idPrefix}-kind`;
  const formatId = `${idPrefix}-format`;
  const topicsId = `${idPrefix}-topics`;
  const kindErrorId = `${idPrefix}-kind-error`;
  const formatErrorId = `${idPrefix}-format-error`;
  const kindFormatErrorId = `${idPrefix}-kind-format-error`;
  const topicsErrorId = `${idPrefix}-topics-error`;
  const hook = hookPrefix ? `data-${hookPrefix}` : undefined;
  const errorAttribute = (field: string) => hookPrefix === 'contribution'
    ? { 'data-contribution-error': true }
    : hookPrefix ? { [`data-${hookPrefix}-field-error`]: field } : {};
  const availableFormats = formatsForKind(kind);
  const allFormats = [...new Set(Object.values(FORMATS_BY_KIND).flat())];
  const kindValues: Array<[string, string]> = kind && !Object.hasOwn(KIND_LABELS, kind)
    ? [[kind, `${kind} (guardado)`], ...Object.entries(KIND_LABELS)]
    : Object.entries(KIND_LABELS);
  const formatValues = preserveInvalidValues && format && !allFormats.includes(format)
    ? [format, ...allFormats] : allFormats;
  const topicValues = preserveInvalidValues
    ? [...topics, ...TOPICS.filter((topic) => !topics.includes(topic))]
    : [...TOPICS];
  const kindDescription = describedBy(helpId, errors.kind ? kindErrorId : undefined, errors.kindFormat ? kindFormatErrorId : undefined);
  const formatDescription = describedBy(helpId, errors.format ? formatErrorId : undefined, errors.kindFormat ? kindFormatErrorId : undefined);
  const topicDescription = describedBy(helpId, errors.topics ? topicsErrorId : undefined);

  return <>
    <div className="resource-classification" data-resource-classification role="group" aria-label="Clasificación del recurso" {...(hook ? { [`${hook}-taxonomy`]: true } : {})}>
      <div className="resource-classification__fields" {...(hookPrefix === 'admin' ? { 'data-admin-field-group': 'kind-format' } : {})}>
        <div className="resource-classification__field">
          <label htmlFor={kindId}>{kindLabel}</label>
          <select id={kindId} name="kind" required={required} value={kind} disabled={disabled}
            aria-invalid={errors.kind || errors.kindFormat ? 'true' : undefined}
            aria-describedby={kindDescription} data-resource-kind {...(hook ? { [`${hook}-kind`]: true } : {})}
            onInvalid={onKindInvalid}
            onChange={inputHandler(onKindChange)}>
            <option value="" selected={kind === ''}>Selecciona una opción</option>
            {kindValues.map(([option, label]) => <option value={option} selected={kind === option}>{label}</option>)}
          </select>
          <span className="resource-classification__error" id={kindErrorId} data-resource-classification-error="kind" {...errorAttribute('kind')} hidden={!errors.kind}>{errors.kind}</span>
        </div>

        <div className="resource-classification__field">
          <label htmlFor={formatId}>Formato</label>
          <select id={formatId} name="format" required={required} value={format} disabled={disabled}
            aria-invalid={errors.format || errors.kindFormat ? 'true' : undefined}
            aria-describedby={formatDescription} data-resource-format {...(hook ? { [`${hook}-format`]: true } : {})}
            onInvalid={onFormatInvalid}
            onChange={inputHandler(onFormatChange)}>
            <option value="" selected={format === ''}>Selecciona un formato</option>
            {formatValues.map((option) => {
              const isCurrentInvalid = preserveInvalidValues && option === format && !availableFormats.includes(option);
              const unavailable = Boolean(kind) && !availableFormats.includes(option) && !isCurrentInvalid;
              return <option value={option} selected={format === option} data-format-kind={Object.entries(FORMATS_BY_KIND).find(([, formats]) => (formats as readonly string[]).includes(option))?.[0]} hidden={unavailable} disabled={unavailable}>{option}</option>;
            })}
          </select>
          <span className="resource-classification__error" id={formatErrorId} data-resource-classification-error="format" {...errorAttribute('format')} hidden={!errors.format}>{errors.format}</span>
        </div>
      </div>
      <span className="resource-classification__error resource-classification__group-error" id={kindFormatErrorId} data-resource-classification-error="kind-format" {...errorAttribute('kind-format')} hidden={!errors.kindFormat}>{errors.kindFormat}</span>
    </div>

    <fieldset className="resource-classification__topics" data-resource-topics-group aria-describedby={topicDescription} aria-invalid={errors.topics ? 'true' : undefined} {...(hook ? { [`${hook}-topics-group`]: true } : {})}>
      <legend>{topicLegend}</legend>
      <div className="resource-classification__topic-options" data-resource-topic-options>
        {topicValues.map((topic, index) => <label key={`${topic}-${index}`}>
          <input type="checkbox" id={`${topicsId}-${topic.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '')}-${index}`} name="topics" value={topic}
            checked={topics.includes(topic)} disabled={disabled} {...(hook ? { [`${hook}-topic`]: true } : {})}
            aria-describedby={topicDescription} aria-invalid={errors.topics ? 'true' : undefined} data-resource-topic
            onChange={(event) => onTopicChange?.(topic, event.currentTarget.checked)} /> {topic}
        </label>)}
      </div>
      <span className="resource-classification__error resource-classification__topics-error" id={topicsErrorId} data-resource-classification-error="topics" {...errorAttribute('topics')} hidden={!errors.topics}>{errors.topics}</span>
    </fieldset>
  </>;
}

