import { formatsForKind, transitionResourceClassification } from './resource-form-policy.mjs';

function controls(root) {
  return {
    kind: root.querySelector('[data-resource-kind]'),
    format: root.querySelector('[data-resource-format]'),
    topics: [...root.querySelectorAll('input[data-resource-topic]')],
  };
}

function readValue(root) {
  const { kind, format, topics } = controls(root);
  return {
    kind: kind?.value ?? '',
    format: format?.value ?? '',
    topics: topics.filter((control) => control.checked).map((control) => control.value),
  };
}

function applyFormatOptions(kind, format, select, preserveCurrent) {
  if (!select) return;
  const available = formatsForKind(kind);
  for (const option of select.options) {
    if (!option.value) continue;
    const currentInvalid = preserveCurrent && option.value === format && !available.includes(option.value);
    const unavailable = !kind || !available.includes(option.value) && !currentInvalid;
    option.hidden = unavailable;
    option.disabled = unavailable;
  }
  if (!preserveCurrent && format && !available.includes(format)) select.value = '';
}

/**
 * Connect the shared classification controls to a screen's existing owner.
 * The DOM remains the source of truth; this adapter does not hold a draft.
 */
export function bindResourceClassification(root, {
  onKindChange,
  onFormatChange,
  onTopicChange,
  onTopicRejected,
} = {}) {
  const { kind, format, topics } = controls(root);
  if (!kind || !format) return { sync() {}, read: () => readValue(root), destroy() {} };

  applyFormatOptions(kind.value, format.value, format, true);
  const onKind = () => {
    const next = transitionResourceClassification(readValue(root), { type: 'kind', value: kind.value });
    kind.value = next.value.kind;
    format.value = next.value.format;
    applyFormatOptions(next.value.kind, next.value.format, format, false);
    onKindChange?.(next.value);
  };
  const onFormat = () => {
    const next = transitionResourceClassification(readValue(root), { type: 'format', value: format.value });
    onFormatChange?.(next.value);
  };
  const onTopic = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
    const current = readValue(root);
    const before = { ...current, topics: [...current.topics] };
    if (target.checked) {
      const checked = topics.filter((control) => control.checked);
      const targetIndex = checked.indexOf(target);
      if (targetIndex >= 0) before.topics.splice(targetIndex, 1);
    } else {
      before.topics.push(target.value);
    }
    const next = transitionResourceClassification(before, {
      type: 'topic', value: target.value, checked: target.checked,
    });
    if (!next.accepted) {
      target.checked = false;
      target.dataset.resourceTopicRejected = 'true';
      onTopicRejected?.(target, next.value);
      return;
    }
    delete target.dataset.resourceTopicRejected;
    onTopicChange?.(next.value, target);
  };
  kind.addEventListener('change', onKind);
  format.addEventListener('change', onFormat);
  root.addEventListener('change', onTopic);
  return {
    sync() {
      applyFormatOptions(kind.value, format.value, format, true);
    },
    read: () => readValue(root),
    destroy() {
      kind.removeEventListener('change', onKind);
      format.removeEventListener('change', onFormat);
      root.removeEventListener('change', onTopic);
    },
  };
}
