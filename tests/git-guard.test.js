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
  assert.ok(asks('"git" status'));
  assert.ok(asks("'git' push"));
  assert.ok(asks('git;ls'));
  assert.ok(asks('git&&ls'));
  assert.ok(asks('git|cat'));
  assert.ok(asks('$(git)'));
  assert.ok(asks('git.exe status'));
  assert.ok(asks('sh -c "git fetch"'));
});

test('non-git commands are untouched', () => {
  assert.strictEqual(decide({ tool_input: { command: 'cat .gitignore' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'ls .git/' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'npm run digit' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'npm i simple-git' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'cat ~/.config/git/config' } }), null);
  assert.strictEqual(decide({ tool_input: { command: 'cat git.txt' } }), null);
  assert.strictEqual(decide({ tool_input: {} }), null);
});
