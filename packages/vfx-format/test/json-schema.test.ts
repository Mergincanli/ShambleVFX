import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION } from '../src/index';
import { effectJsonSchema } from '../src/validate/index';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema', `effect.v${FORMAT_VERSION}.schema.json`);

describe('JSON Schema file', () => {
  it('matches the schema in code (to refresh it: UPDATE_SCHEMA=1 npx vitest run json-schema)', () => {
    const text = JSON.stringify(effectJsonSchema(), null, 2) + '\n';
    if (process.env.UPDATE_SCHEMA) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    expect(readFileSync(file, 'utf8')).toBe(text);
  });
});
