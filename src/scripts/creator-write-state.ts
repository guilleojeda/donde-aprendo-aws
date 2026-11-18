import type { CreatorVersionChange, CreatorVersionEntity } from '../types/creators';

export type { CreatorVersionChange } from '../types/creators';

const VERSION_ENTITIES = new Set<CreatorVersionEntity>(['profile', 'resource']);

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

export function readCreatorVersionChanges(payload: unknown): CreatorVersionChange[] | null {
  const value = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).versionChanges
    : undefined;
  if (!Array.isArray(value) || !value.every(isVersionChange)) return null;
  return value;
}

type WriteControl = HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function createCreatorWriteGuard(root: HTMLElement) {
  let active = false;
  const originalDisabled = new WeakMap<WriteControl, boolean>();

  function applyDisabledState() {
    root.querySelectorAll<WriteControl>('button, input[type="file"], input[data-busy-control], [data-creator-stale]').forEach((control) => {
      if (!originalDisabled.has(control)) originalDisabled.set(control, control.disabled);
      const has = (name: string) => control.hasAttribute?.(name) ?? false;
      control.disabled = originalDisabled.get(control) === true
        || has('data-creator-stale')
        || (active && (control.tagName === 'BUTTON'
          || (control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'file')
          || has('data-busy-control')));
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
  };
}
