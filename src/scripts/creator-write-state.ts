import type { CreatorVersionChange, CreatorVersionEntity } from '../types/creators';

export type { CreatorVersionChange } from '../types/creators';

const VERSION_ENTITIES = new Set<CreatorVersionEntity>(['profile', 'resource', 'placement', 'series']);

function isVersionChange(value: unknown): value is CreatorVersionChange {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const change = value as Record<string, unknown>;
  return typeof change.entity === 'string'
    && VERSION_ENTITIES.has(change.entity as CreatorVersionEntity)
    && typeof change.id === 'string'
    && change.id.length > 0
    && Number.isSafeInteger(change.before)
    && Number.isSafeInteger(change.after)
    && Number(change.before) >= 0
    && Number(change.after) >= 0
    && change.before !== change.after;
}

export async function readCreatorVersionChanges(response: Response): Promise<CreatorVersionChange[] | null> {
  let value: unknown;
  if (response.status === 204) {
    const header = response.headers.get('Creator-Write-Versions');
    if (!header) return null;
    try {
      value = JSON.parse(header);
    } catch {
      return null;
    }
  } else {
    try {
      const body: unknown = await response.clone().json();
      value = typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>).versionChanges
        : undefined;
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value) || !value.every(isVersionChange)) return null;
  return value;
}

type WriteControl = HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function createCreatorWriteGuard(root: HTMLElement) {
  let active = false;
  const originalDisabled = new WeakMap<WriteControl, boolean>();

  function applyDisabledState() {
    root.querySelectorAll<WriteControl>('button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]').forEach((control) => {
      if (!originalDisabled.has(control)) originalDisabled.set(control, control.disabled);
      const has = (name: string) => control.hasAttribute?.(name) ?? false;
      control.disabled = originalDisabled.get(control) === true
        || has('data-creator-stale')
        || (active && (control.tagName === 'BUTTON'
          || (control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'file')
          || has('data-busy-control') || has('data-featured') || has('data-directory')));
    });
  }

  return {
    isActive(): boolean {
      return active;
    },
    async run(event: Event, action: () => Promise<void> | void): Promise<void> {
      if (active) {
        event.preventDefault();
        return;
      }
      active = true;
      applyDisabledState();
      try {
        await action();
      } finally {
        active = false;
        applyDisabledState();
      }
    },
    markStale(selector: string) {
      root.querySelectorAll<WriteControl>(selector).forEach((control) => {
        control.setAttribute('data-creator-stale', 'true');
      });
      applyDisabledState();
    },
  };
}
