import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { CreatorOwnerIdentityField } from '../../lib/creator-owner-state';

type IdentityFeedbackField = CreatorOwnerIdentityField;

const FIELD_LABELS: Record<IdentityFeedbackField, string> = {
  displayName: 'el nombre visible',
  slug: 'la dirección de tu página',
  city: 'la ciudad',
  country: 'el país',
  bio: 'la presentación',
  programs: 'los programas de AWS',
};

export function identityFieldErrorId(prefix: string, field: IdentityFeedbackField): string {
  return `${prefix}-${field}-error`;
}

export function identityFieldHelpId(prefix: string, field: IdentityFeedbackField): string {
  return `${prefix}-${field}-help`;
}

export function identityFieldDescribedBy(prefix: string, field: IdentityFeedbackField, hasError: boolean): string | undefined {
  const help = field === 'slug' || field === 'bio' ? identityFieldHelpId(prefix, field) : undefined;
  const error = hasError ? identityFieldErrorId(prefix, field) : undefined;
  const value = [help, error].filter(Boolean).join(' ');
  return value || undefined;
}

export function nativeIdentityFieldMessage(field: IdentityFeedbackField, control: HTMLInputElement | HTMLTextAreaElement): string {
  if (control.validity.valueMissing) {
    return field === 'displayName' ? 'Completa el nombre visible.' : `Completa ${FIELD_LABELS[field]}.`;
  }
  if (control.validity.patternMismatch) {
    return 'La dirección debe tener entre 3 y 40 caracteres, con minúsculas, números y guiones sencillos.';
  }
  if (control.validity.tooShort) return `Completa ${FIELD_LABELS[field]} con más caracteres.`;
  if (control.validity.tooLong) return `Reduce ${FIELD_LABELS[field]} para respetar el límite.`;
  if (control.validity.typeMismatch) return `Revisa ${FIELD_LABELS[field]}.`;
  return `Revisa ${FIELD_LABELS[field]}.`;
}

export function useNativeIdentityFieldErrors(scope?: string) {
  const [errors, setErrors] = useState<Partial<Record<IdentityFeedbackField, string>>>({});
  const firstInvalid = useRef<HTMLElement | null>(null);
  const focusScheduled = useRef(false);
  useEffect(() => {
    setErrors({});
    firstInvalid.current = null;
    focusScheduled.current = false;
  }, [scope]);
  const onInvalid = useCallback((field: IdentityFeedbackField, control: HTMLInputElement | HTMLTextAreaElement, event: Event) => {
    event.preventDefault();
    setErrors((current) => ({ ...current, [field]: nativeIdentityFieldMessage(field, control) }));
    if (!firstInvalid.current) firstInvalid.current = control;
    if (!focusScheduled.current) {
      focusScheduled.current = true;
      setTimeout(() => {
        focusScheduled.current = false;
        const target = firstInvalid.current;
        if (!target || !target.isConnected || target.matches(':disabled')) return;
        target.focus({ preventScroll: true });
        target.scrollIntoView?.({ block: 'nearest' });
      }, 0);
    }
  }, []);
  const onInput = useCallback((field: IdentityFeedbackField) => {
    firstInvalid.current = null;
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);
  return { errors, onInvalid, onInput };
}

export function IdentityFieldError({ id, text }: { id: string; text?: string }) {
  return <p id={id} class="creator-owner__field-error" data-owner-field-error role="alert" hidden={!text}>{text}</p>;
}
