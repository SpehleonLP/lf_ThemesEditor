import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseDocument, serializeDocument } from '../src/document';
import { isValidBorderName } from '../src/borderNames';

const fixture = () => readFile('tests/fixtures/borders.json', 'utf-8');

test('golden round-trip is value-identical', async () => {
  const text = await fixture();
  const doc = parseDocument(text);
  expect(JSON.parse(serializeDocument(doc))).toEqual(JSON.parse(text));
});

test('second save is byte-identical (stable formatting)', async () => {
  const doc = parseDocument(await fixture());
  const once = serializeDocument(doc);
  expect(serializeDocument(parseDocument(once))).toBe(once);
});

test('entry order is preserved', async () => {
  const text = await fixture();
  const doc = parseDocument(text);
  expect(doc.names).toEqual(Object.keys(JSON.parse(text)));
});

test('border name validation mirrors the enum patterns', () => {
  for (const ok of ['Window_0', 'Backing_2', 'Panel_3_3', 'DecorativeGroupBox_0_1', 'FlatGroupBox_2_7', 'Slider_1'])
    expect(isValidBorderName(ok), ok).toBe(true);
  for (const bad of ['FlatGroupBox_0', 'Window_4', 'Backing_3', 'Panel_4_0', 'window_0', 'BlendMode'])
    expect(isValidBorderName(bad), bad).toBe(false);
});
