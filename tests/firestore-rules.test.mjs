import fs from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = 'demo-cici-fitness';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

after(async () => {
  await env?.cleanup();
});

test('private user document is owner-only', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  const path = 'users/alice';

  await assertSucceeds(setDoc(doc(alice, path), { plan: 'private' }));
  await assertSucceeds(getDoc(doc(alice, path)));
  await assertFails(getDoc(doc(bob, path)));
  await assertFails(setDoc(doc(bob, path), { plan: 'overwrite' }));
  await assertFails(getDoc(doc(anonymous, path)));
});

test('shared profile is readable only by owner or explicit readers', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const charlie = env.authenticatedContext('charlie').firestore();
  const path = 'users/alice/shared/profile';

  await assertSucceeds(
    setDoc(doc(alice, path), {
      displayName: 'A',
      allowedReaders: ['bob'],
    }),
  );

  await assertSucceeds(getDoc(doc(alice, path)));
  await assertSucceeds(getDoc(doc(bob, path)));
  await assertFails(getDoc(doc(charlie, path)));
});

test('a reader cannot modify another user shared profile', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const path = 'users/alice/shared/profile';

  await assertSucceeds(
    setDoc(doc(alice, path), {
      displayName: 'A',
      allowedReaders: ['bob'],
    }),
  );
  await assertFails(
    setDoc(doc(bob, path), {
      displayName: 'tampered',
      allowedReaders: ['bob'],
    }),
  );
});

test('unmatched nested user subcollections remain denied', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const path = 'users/alice/private/entry';

  await assertFails(setDoc(doc(alice, path), { hidden: true }));
  await assertFails(getDoc(doc(alice, path)));
  await assertFails(getDoc(doc(bob, path)));
});
