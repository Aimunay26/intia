import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getRootDirs } = require('@next/eslint-plugin-next/dist/utils/get-root-dirs.js');

test('Next ESLint keeps cwd and expands rootDir directories with the security replacement',()=>{
  const root=mkdtempSync(join(tmpdir(),'intia-eslint-glob-'));
  try {
    for(const name of ['web','admin']) mkdirSync(join(root,name));
    writeFileSync(join(root,'file.txt'),'not a directory');
    const context={cwd:root,settings:{}};
    assert.deepEqual(getRootDirs(context),[root]);
    context.settings.next={rootDir:root.replaceAll('\\','/')+'/*'};
    assert.deepEqual(getRootDirs(context).map(p=>resolve(p)).sort(),['admin','web'].map(n=>join(root,n)));
    context.settings.next.rootDir=[root.replaceAll('\\','/')+'/{web,admin}',false];
    assert.equal(getRootDirs(context).length,2);
  } finally {rmSync(root,{recursive:true,force:true});}
});
