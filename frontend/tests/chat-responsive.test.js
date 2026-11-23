import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner chat uses available workspace height and a single mobile column', async () => {
  const [chat, shell] = await Promise.all([
    read('pages/owner/ChatView.jsx'), read('components/operations/OperationsShell.jsx'),
  ]);
  assert.match(chat, /grid-cols-1 lg:grid-cols-/);
  assert.match(chat, /selectedConversation \? 'hidden lg:flex' : 'flex'/);
  assert.match(chat, /aria-label="Back to conversations"/);
  assert.match(chat, /overflow-x-hidden overflow-y-auto/);
  assert.match(chat, /min-w-0 flex-1 resize-none/);
  assert.doesNotMatch(chat, /min-h-\[620px\]/);
  assert.match(shell, /activeId === 'chat' \? 'overflow-hidden'/);
  assert.match(shell, /activeId === 'chat' \? 'h-full min-h-0/);
});
