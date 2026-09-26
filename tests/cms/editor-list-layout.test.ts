import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const editorPage = readFileSync(new URL('../../src/pages/earth/editor.astro', import.meta.url), 'utf8');

for (const [element, marker] of [['ol', 'decimal'], ['ul', 'disc']] as const) {
  test(`Earth writing panel displays ${element} markers inside the scroll area`, () => {
    const rules = [...editorPage.matchAll(new RegExp(`\\.body-input \\.ProseMirror ${element}\\s*\\{([^}]+)\\}`, 'g'))];
    assert.ok(rules.some((rule) =>
      new RegExp(`list-style-type:\\s*${marker}\\s*;`).test(rule[1])
      && /padding-inline-start:\s*(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)em\s*;/.test(rule[1]),
    ), `Missing visible ${element} markers in the writing panel`);
  });
}
