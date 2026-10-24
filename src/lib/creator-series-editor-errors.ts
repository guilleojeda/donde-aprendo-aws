export async function creatorSeriesFailureMessage(response: Response, fallback: string): Promise<string> {
  if (response.status !== 409) return fallback;
  try {
    const payload: unknown = await response.clone().json();
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      && 'error' in payload && payload.error === 'SERIES_SLUG_TAKEN') {
      return 'La dirección de esta serie ya está reservada. Elige otra dirección.';
    }
  } catch {
    // Keep the normal status message when a failed response has no valid JSON body.
  }
  return fallback;
}
