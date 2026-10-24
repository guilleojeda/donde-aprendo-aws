function responseErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  if (!('error' in value) || typeof value.error !== 'string') return undefined;
  return value.error;
}

export async function creatorEditorFailureMessage(response: Response, fallback: string): Promise<string> {
  if (response.status !== 409 && response.status !== 422) return fallback;
  try {
    const error = responseErrorCode(await response.clone().json());
    if (response.status === 409 && error === 'SLUG_TAKEN') {
      return 'Esa dirección ya está reservada. Elige otra dirección para tu página.';
    }
    if (response.status === 422 && error === 'INVALID_URL') {
      return 'La URL debe comenzar con http:// o https:// y no incluir usuario ni contraseña.';
    }
  } catch {
    // Keep the status-based fallback when a failed response has no valid JSON body.
  }
  return fallback;
}
