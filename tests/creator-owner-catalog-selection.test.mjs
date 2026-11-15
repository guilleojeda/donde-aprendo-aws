import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadCatalog() {
  const { outputFiles } = await build({
    entryPoints: [new URL('../src/lib/creator-owner-catalog.ts', import.meta.url).pathname],
    bundle: true, format: 'esm', platform: 'node', write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const catalog = await loadCatalog();

test('catalog selection validates its type and exact 256-byte resource identity boundary', () => {
  const valid = { id: 'catalog-one', title: 'Curso', url: 'https://example.test/course', tipo: 'content' };
  assert.deepEqual(catalog.parseCreatorOwnerCatalog([valid]), [valid]);
  assert.equal(catalog.parseCreatorOwnerCatalog([{ ...valid, tipo: ['content'] }]), undefined);
  assert.equal(catalog.parseCreatorOwnerCatalog([{ ...valid, id: 'á'.repeat(129) }]), undefined);
  const boundary = `aws:${'列'.repeat(84)}`;
  assert.equal(Buffer.byteLength(boundary, 'utf8'), 256);
  assert.equal(catalog.parseCreatorOwnerCatalog([{ ...valid, id: boundary }])?.[0]?.id, boundary);
  assert.equal(catalog.parseCreatorOwnerCatalog([{ ...valid, id: `${boundary}x` }]), undefined);
});
