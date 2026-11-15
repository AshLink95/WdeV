const test = require('node:test');
const assert = require('node:assert');
const { decide } = require('../hooks/git-guard');

const asks = (command) => decide({ tool_name: 'Bash', tool_input: { command } })?.hookSpecificOutput.permissionDecision === 'ask';

test('every git command needs approval', () => {
  assert.ok(asks('git status'));
  assert.ok(asks('git'));
  assert.ok(asks('cd repo && git log --oneline'));
  assert.ok(asks('ls; git push'));
  assert.ok(asks('echo $(git rev-parse HEAD)'));
  assert.ok(asks('/usr/bin/git diff'));
  assert.ok(asks('ls\ngit commit -m x'));
});

test('non-git commands are untouched', () => {
  assert.strictEqual(decide({ tool_input: { command: 'cat .gitignore' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'ls .git/' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'npm run digit' } }), null);
  assert.strictEqual(decide({ tool_input: {} }), null);
});
