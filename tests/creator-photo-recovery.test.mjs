import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatorPhotoHarness, rasterPhotoFixtures } from './fixtures/creator-photos.mjs';

test('a lost commit acknowledgement and failed confirmation cannot delete a selected final photo', async () => {
  const h = await createCreatorPhotoHarness();
  const { jpeg } = await rasterPhotoFixtures();
  const upload = await h.service.beginUpload({ profileId: 'creator-a', expectedVersion: 1 });
  h.objects.seed(upload.post.fields.key, jpeg);
  const transact = h.store.transact.bind(h.store);
  const get = h.store.get.bind(h.store);
  let confirmationFails = false;
  h.store.transact = async (input) => {
    const result = await transact(input);
    if (input.puts.some(({ value }) => value.state === 'complete')) {
      confirmationFails = true;
      throw new Error('commit acknowledgement lost');
    }
    return result;
  };
  h.store.get = async (key) => {
    if (confirmationFails) {
      confirmationFails = false;
      throw new Error('confirmation unavailable');
    }
    return get(key);
  };
  const input = { profileId: 'creator-a', uploadId: upload.uploadId, expectedVersion: 1 };
  await assert.rejects(h.service.finalizeUpload(input), /acknowledgement lost/);
  const profile = await h.store.get('profile:creator-a');
  assert.equal(profile.photo.version, upload.uploadId);
  assert.equal(profile.version, 2);
  const photo = await h.service.readPhoto({ profileId: 'creator-a', version: upload.uploadId });
  assert.ok(photo?.body.length > 0, 'the committed profile still has its immutable WebP');
  const retry = await h.service.finalizeUpload(input);
  assert.deepEqual(retry.photo, profile.photo, 'retry recovers the committed result without replacing it');
});
