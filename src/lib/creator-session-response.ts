export type CreatorSessionResponse = { error?: unknown; csrfToken?: unknown };

export type CreatorSessionRecoveryReason = 'expired' | 'csrf';

export type CreatorSessionCheck =
  | { state: 'ready'; csrfToken: string }
  | { state: 'expired' | 'disabled' | 'context-changed' | 'invalid-context' | 'unavailable' };

export async function readCreatorSessionResponse(response: Response): Promise<CreatorSessionResponse | null> {
  try {
    const value: unknown = await response.clone().json();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    return value as CreatorSessionResponse;
  } catch {
    return null;
  }
}

export function creatorSessionRecoveryReason(
  status: number,
  payload: CreatorSessionResponse | null,
): CreatorSessionRecoveryReason | undefined {
  if (status === 401) return 'expired';
  if (status === 403 && payload?.error === 'CSRF_REJECTED') return 'csrf';
  return undefined;
}

export function classifyCreatorSessionCheck(status: number, payload: CreatorSessionResponse | null): CreatorSessionCheck {
  if (status === 200 && typeof payload?.csrfToken === 'string' && payload.csrfToken.trim().length > 0) {
    return { state: 'ready', csrfToken: payload.csrfToken };
  }
  if (status === 401) return { state: 'expired' };
  if (status === 403 && payload?.error === 'ACCOUNT_DISABLED') return { state: 'disabled' };
  if (status === 409 && payload?.error === 'SESSION_CONTEXT_CHANGED') return { state: 'context-changed' };
  if (status === 422 && payload?.error === 'INVALID_CONTEXT') return { state: 'invalid-context' };
  return { state: 'unavailable' };
}

export function isCreatorSessionBinding(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
