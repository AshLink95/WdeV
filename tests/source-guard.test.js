const test = require('node:test');
const assert = require('node:assert');
const { decide, SOURCES } = require('../hooks/source-guard');

const fetch = (agent_type, url) => decide({ agent_type, tool_name: 'WebFetch', tool_input: { url, prompt: 'p' } });
const denied = (out) => out?.hookSpecificOutput.permissionDecision === 'deny';

test('physicist fetches only from trusted domains and their subdomains', () => {
  assert.strictEqual(fetch('physicist', 'https://journals.aps.org/prx/abstract/x'), null);
  assert.strictEqual(fetch('physicist', 'https://export.arxiv.org/abs/2101.00001'), null);
  assert.ok(denied(fetch('physicist', 'https://evil-arxiv.org/')));
  assert.ok(denied(fetch('physicist', 'https://en.wikipedia.org/wiki/Physics')));
  assert.ok(denied(fetch('physicist', 'not a url')));
});

test('physicist searches are pinned to the allowlist', () => {
  const out = decide({ agent_type: 'physicist', tool_name: 'WebSearch', tool_input: { query: 'Lindblad' } });
  assert.deepStrictEqual(out.hookSpecificOutput.updatedInput, { query: 'Lindblad', allowed_domains: SOURCES.physicist });
});

test('other agents are untouched', () => {
  assert.strictEqual(fetch(undefined, 'https://en.wikipedia.org/'), null);
  assert.strictEqual(fetch('Explore', 'https://en.wikipedia.org/'), null);
  assert.strictEqual(fetch('toString', 'https://en.wikipedia.org/'), null);
});

test('plugin-namespaced agent type is guarded the same', () => {
  assert.ok(denied(fetch('wdev:physicist', 'https://en.wikipedia.org/')));
});
