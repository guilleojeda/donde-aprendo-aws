import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { CreatorOwnerIdentityField, CreatorOwnerProfileField } from '../../lib/creator-owner-state';

type IdentityFeedbackField = CreatorOwnerIdentityField;

const FIELD_LABELS: Record<CreatorOwnerProfileField, string> = {
  displayName: 'el nombre visible',
  slug: 'la dirección de tu página',
  city: 'la ciudad',
  country: 'el país',
  bio: 'la presentación',
  programs: 'los programas de AWS',
};

export function identityFieldErrorId(prefix: string, field: IdentityFeedbackField): string {
  return `${prefix}-${field.replace('.', '-')}-error`;
}

export function identityFieldHelpId(prefix: string, field: IdentityFeedbackField): string {
  return `${prefix}-${field}-help`;
}

export function identityFieldDescribedBy(prefix: string, field: IdentityFeedbackField, hasError: boolean,
  help = field === 'slug' || field === 'bio' ? identityFieldHelpId(prefix, field) : undefined): string | undefined {
  const error = hasError ? identityFieldErrorId(prefix, field) : undefined;
  const value = [help, error].filter(Boolean).join(' ');
  return value || undefined;
}

export function nativeIdentityFieldMessage(field: IdentityFeedbackField, control: HTMLInputElement | HTMLTextAreaElement): string {
  if (control.validity.customError) return control.validationMessage;
  if (field === 'photo') return 'Elige una foto.';
  const label = FIELD_LABELS[field as CreatorOwnerProfileField];
  if (!label) return 'Ingresa una URL HTTP o HTTPS completa sin usuario ni contraseña.';
  if (control.validity.valueMissing) {
    return `Completa ${label}.`;
  }
  if (control.validity.patternMismatch) {
    return 'La dirección debe tener entre 3 y 40 caracteres, con minúsculas, números y guiones sencillos.';
  }
  if (control.validity.tooShort) return `Completa ${label} con más caracteres.`;
  if (control.validity.tooLong) return `Reduce ${label} para respetar el límite.`;
  return `Revisa ${label}.`;
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
        firstInvalid.current = null;
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
