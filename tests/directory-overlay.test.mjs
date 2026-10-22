import assert from 'node:assert/strict';
import test from 'node:test';
import { positionDirectoryOverlay } from '../src/scripts/directory-overlay.js';

function disclosureAt({ width, height, trigger, panel, align = 'start' }) {
  const summary = { getBoundingClientRect: () => trigger };
  const overlay = {
    dataset: align === 'end' ? { overlayAlign: 'end' } : {},
    style: { maxHeight: '100px' },
    getBoundingClientRect() {
      return {
        width: Math.min(panel.width, Number.parseFloat(this.style.maxWidth) || panel.width),
        height: Math.min(panel.height, Number.parseFloat(this.style.maxHeight) || panel.height),
      };
    },
  };
  return {
    open: true,
    ownerDocument: { documentElement: { clientWidth: width, clientHeight: height } },
    querySelector(selector) {
      return selector === 'summary' ? summary : selector === '[data-directory-overlay-panel]' ? overlay : null;
    },
    overlay,
  };
}

test('directory overlay width and placement stay inside the usable viewport beside a scrollbar', () => {
  const disclosure = disclosureAt({
    width: 305,
    height: 480,
    trigger: { left: 270, right: 300, top: 390, bottom: 420 },
    panel: { width: 640, height: 220 },
  });

  positionDirectoryOverlay(disclosure);

  assert.equal(disclosure.overlay.style.maxWidth, '281px');
  assert.equal(disclosure.overlay.style.left, '12px');
  assert.equal(disclosure.overlay.style.top, '162px', 'the panel opens above when the trigger is close to the bottom');
  assert.equal(Number.parseFloat(disclosure.overlay.style.left) + 281, 293, 'the panel keeps a 12px right margin');
});

test('directory overlay aligns to the summary edge and stays below when there is room', () => {
  const disclosure = disclosureAt({
    width: 375,
    height: 844,
    trigger: { left: 100, right: 340, top: 200, bottom: 240 },
    panel: { width: 300, height: 220 },
    align: 'end',
  });

  positionDirectoryOverlay(disclosure);

  assert.equal(disclosure.overlay.style.left, '40px');
  assert.equal(disclosure.overlay.style.top, '248px');
  assert.equal(disclosure.overlay.style.maxHeight, '820px');
});
