export async function creatorSeriesFailureMessage(response: Response, fallback: string): Promise<string> {
  if (response.status !== 409) return fallback;
  try {
    const payload: unknown = await response.clone().json();
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      && 'error' in payload && payload.error === 'SERIES_SLUG_TAKEN') {
      return 'La dirección de esta serie ya está reservada. Elige otra dirección.';
    }
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      && 'error' in payload && payload.error === 'PROFILE_CONFLICT') {
      return 'El perfil cambió desde que abriste la página. Recárgala antes de volver a guardar.';
    }
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      && 'error' in payload && payload.error === 'SERIES_CONFLICT') {
      return 'La serie, sus capítulos o el perfil cambiaron desde que abriste la página. Recárgala antes de volver a guardar.';
    }
  } catch {
    // Keep the normal status message when a failed response has no valid JSON body.
  }
  return fallback;
}
