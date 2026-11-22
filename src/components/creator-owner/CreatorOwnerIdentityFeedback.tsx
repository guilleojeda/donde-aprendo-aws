import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { CreatorOwnerEditorField, CreatorOwnerIdentityField, CreatorOwnerProfileField } from '../../lib/creator-owner-state';

type IdentityFeedbackField = CreatorOwnerIdentityField;
export type CreatorOwnerField = CreatorOwnerEditorField;

const FIELD_LABELS: Record<CreatorOwnerProfileField, string> = {
  displayName: 'el nombre visible',
  slug: 'la dirección de tu página',
  city: 'la ciudad',
  country: 'el país',
  bio: 'la presentación',
  programs: 'los programas de AWS',
};

export function identityFieldErrorId(prefix: string, field: CreatorOwnerField): string {
  return `${prefix}-${field.replace('.', '-')}-error`;
}

export function identityFieldHelpId(prefix: string, field: CreatorOwnerField): string {
  return `${prefix}-${field}-help`;
}

export function identityFieldDescribedBy(prefix: string, field: CreatorOwnerField, hasError: boolean,
  help = field === 'slug' || field === 'bio' ? identityFieldHelpId(prefix, field) : undefined,
  additionalId?: string): string | undefined {
  const error = hasError ? identityFieldErrorId(prefix, field) : undefined;
  const value = [help, error, additionalId].filter(Boolean).join(' ');
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

export function nativeCreatorOwnerFieldMessage(field: CreatorOwnerField, control: HTMLInputElement | HTMLTextAreaElement): string {
  if (control.validity.customError) return control.validationMessage;
  if (field === 'name') {
    if (control.validity.valueMissing) return 'Completa el nombre de la serie.';
    if (control.validity.tooLong) return 'Reduce el nombre de la serie para respetar el límite.';
    return 'Revisa el nombre de la serie.';
  }
  if (field === 'title') {
    if (control.validity.valueMissing) return 'Completa el título.';
    if (control.validity.tooLong) return 'Reduce el título para respetar el límite.';
    return 'Revisa el título.';
  }
  if (field === 'url' || field === 'knownUrls') {
    if (control.validity.valueMissing) return field === 'url' ? 'Completa la URL.' : 'Ingresa una URL conocida.';
    if (control.validity.tooLong) return field === 'url' ? 'Reduce la URL para respetar el límite.' : 'Reduce las URLs conocidas para respetar el límite.';
    if (control.validity.typeMismatch || control.validity.patternMismatch) return 'Ingresa una URL HTTP o HTTPS completa.';
    return field === 'url' ? 'Revisa la URL.' : 'Revisa las URLs conocidas.';
  }
  if (field === 'description') {
    if (control.validity.tooLong) return 'Reduce la descripción para respetar el límite.';
    return 'Revisa la descripción.';
  }
  if (field === 'position') {
    if (control.validity.valueMissing) return 'Completa la posición.';
    if (control.validity.rangeUnderflow || control.validity.rangeOverflow || control.validity.stepMismatch || control.validity.badInput) {
      return 'Ingresa una posición válida dentro del rango.';
    }
    return 'Revisa la posición.';
  }
  if (field === 'evidence') {
    if (control.validity.tooLong) return 'Reduce el contexto privado para respetar el límite.';
    return 'Revisa el contexto privado.';
  }
  return nativeIdentityFieldMessage(field as IdentityFeedbackField, control);
}

export function useNativeIdentityFieldErrors(scope?: string) {
  return useNativeFieldErrors<IdentityFeedbackField>(scope, nativeIdentityFieldMessage);
}

export function useNativeFieldErrors<T extends string = IdentityFeedbackField>(scope?: string,
  getMessage: (field: T, control: HTMLInputElement | HTMLTextAreaElement) => string = ((field, control) =>
    nativeCreatorOwnerFieldMessage(field as CreatorOwnerField, control)) as (field: T, control: HTMLInputElement | HTMLTextAreaElement) => string) {
  const [errors, setErrors] = useState<Partial<Record<T, string>>>({});
  const firstInvalid = useRef<HTMLElement | null>(null);
  const focusScheduled = useRef(false);
  useEffect(() => {
    setErrors({});
    firstInvalid.current = null;
    focusScheduled.current = false;
  }, [scope]);
  const onInvalid = useCallback((field: T, control: HTMLInputElement | HTMLTextAreaElement, event: Event) => {
    event.preventDefault();
    setErrors((current) => ({ ...current, [field]: getMessage(field, control) }));
    if (!firstInvalid.current) firstInvalid.current = control;
    if (!focusScheduled.current) {
      focusScheduled.current = true;
      setTimeout(() => {
        focusScheduled.current = false;
        const target = firstInvalid.current;
        firstInvalid.current = null;
        if (!target || !target.isConnected || target.matches(':disabled')) return;
        target.focus({ preventScroll: true });
        const field = target.closest<HTMLElement>('.creator-owner__field') ?? target;
        field.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      }, 0);
    }
  }, []);
  const onInput = useCallback((field: T) => {
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
