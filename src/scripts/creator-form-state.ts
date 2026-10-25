type EditableControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type ControlValue = string | boolean | Array<string | File>;

export type FormValueSnapshot = Map<EditableControl, ControlValue>;

function controlsWithin(scope: ParentNode): EditableControl[] {
  const controls = [...scope.querySelectorAll<EditableControl>('input, textarea, select')];
  if ('matches' in scope && typeof scope.matches === 'function'
    && scope.matches('input, textarea, select')) {
    controls.unshift(scope as EditableControl);
  }
  return controls;
}

function valueOf(control: EditableControl): ControlValue {
  if (control.tagName === 'INPUT' && ['checkbox', 'radio'].includes((control as HTMLInputElement).type)) {
    return (control as HTMLInputElement).checked;
  }
  if (control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'file') {
    return [...((control as HTMLInputElement).files ?? [])];
  }
  if (control.tagName === 'SELECT' && (control as HTMLSelectElement).multiple) {
    return [...(control as HTMLSelectElement).selectedOptions].map((option) => option.value);
  }
  return control.value;
}

function sameValue(left: ControlValue, right: ControlValue): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

function shouldTrack(control: EditableControl): boolean {
  const form = control.form;
  if (form?.getAttribute('method')?.toLowerCase() === 'get') {
    return control.matches('[data-featured], [data-directory]');
  }
  return true;
}

export function createCreatorFormState(root: ParentNode) {
  const baseline = new WeakMap<EditableControl, ControlValue>();
  const allControls = () => controlsWithin(root).filter(shouldTrack);
  allControls().forEach((control) => baseline.set(control, valueOf(control)));

  return {
    capture(scope: ParentNode): FormValueSnapshot {
      return new Map(controlsWithin(scope).map((control) => [control, valueOf(control)]));
    },
    commit(snapshot: FormValueSnapshot | undefined) {
      snapshot?.forEach((value, control) => baseline.set(control, value));
    },
    hasPendingChanges(): boolean {
      return allControls().some((control) => {
        const savedValue = baseline.get(control);
        return savedValue === undefined || !sameValue(valueOf(control), savedValue);
      });
    },
  };
}
