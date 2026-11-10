import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: [new URL('../src/scripts/creator-form-state.ts', import.meta.url).pathname],
  bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022',
});
const { createCreatorFormState } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

// These controls supply the DOM value/default properties; the production helper
// decides what is pending. Native startup/navigation is covered in the browser spec.
const cases = [
  {
    name: 'text correction',
    control: () => ({ tagName: 'INPUT', type: 'text', value: 'Seguridad', defaultValue: 'Serverless' }),
    revert: (control) => { control.value = 'Serverless'; },
  },
  {
    name: 'single-select correction',
    control: () => ({
      tagName: 'SELECT', type: 'select-one', multiple: false, value: 'Video',
      options: [
        { value: 'Artículo', defaultSelected: true, selected: false },
        { value: 'Video', defaultSelected: false, selected: true },
      ],
    }),
    revert: (control) => {
      control.value = 'Artículo';
      control.options[0].selected = true;
      control.options[1].selected = false;
    },
  },
  {
    name: 'claim checkbox correction',
    control: () => ({ tagName: 'INPUT', type: 'checkbox', checked: false, defaultChecked: true, value: 'resource-a', defaultValue: 'resource-a' }),
    revert: (control) => { control.checked = true; },
  },
];

for (const { name, control: makeControl, revert } of cases) {
  test(`the initial baseline preserves a ${name} entered before initialization`, () => {
    const control = makeControl();
    const state = createCreatorFormState({ querySelectorAll: () => [control] });
    assert.equal(state.hasPendingChanges(), true, 'initialization cannot adopt an existing correction as saved data');
    revert(control);
    assert.equal(state.hasPendingChanges(), false, 'restoring the rendered value clears the correction without a write');
  });
}
