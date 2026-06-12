// tests/bg/state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { bgState, bgSubscribe, bgNotify, bgStructuralKey, selectTab, selectEntry } from '../../src/bg/state';

beforeEach(() => { bgState.tab = 'backdrops'; bgState.selected = { backdrops: null, lights: null, texcoords: null, gradients: null }; bgState.structuralNonce = 0; });

describe('bg/state', () => {
  it('notifies subscribers', () => {
    let n = 0; bgSubscribe(() => n++); bgNotify(); expect(n).toBe(1);
  });
  it('structural key changes on tab switch and selection', () => {
    const k0 = bgStructuralKey();
    selectTab('lights');
    expect(bgStructuralKey()).not.toBe(k0);
    const k1 = bgStructuralKey();
    selectEntry('lights', 'White');
    expect(bgStructuralKey()).not.toBe(k1);
  });
  it('selectEntry stores per-tab selection', () => {
    selectEntry('gradients', 'g'); expect(bgState.selected.gradients).toBe('g');
    expect(bgState.selected.lights).toBeNull();
  });
});
