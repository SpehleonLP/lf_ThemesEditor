import { expect, test } from 'vitest';
import { FILL_VALUE } from '../src/types';

test('fill enum matches PatchFillType', () => {
  expect(FILL_VALUE.FLEXIBLE).toBe(4);
  expect(FILL_VALUE.CENTER).toBe(5);
});
