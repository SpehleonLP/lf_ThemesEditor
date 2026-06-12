// tests/bg/state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { bgState, bgSubscribe, bgNotify, bgStructuralKey, selectTab, selectEntry, setPairing } from '../../src/bg/state';

beforeEach(() => { bgState.tab = 'backdrops'; bgState.selected = { backdrops: null, lights: null, texcoords: null, gradients: null }; bgState.structuralNonce = 0; bgState.pairing = {}; });

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

  it('setPairing on an unchanged pair does not notify (no redundant repaint)', () => {
    setPairing('Backdrop_0', 'White', '');
    let n = 0; bgSubscribe(() => n++);
    setPairing('Backdrop_0', 'White', ''); // identical → suppressed
    expect(n).toBe(0);
    setPairing('Backdrop_0', 'Lamp', ''); // changed → notifies
    expect(n).toBe(1);
  });

  it('a subscriber that calls setPairing does not recurse infinitely (re-entrancy guard)', () => {
    // Reproduces the updateLightForm→setPairing→bgNotify loop: a listener pairs a light
    // every time it runs. Without the guard this overflows the stack.
    bgState.selected.backdrops = 'Backdrop_0';
    let runs = 0;
    bgSubscribe(() => { runs++; setPairing('Backdrop_0', 'White', ''); });
    expect(() => bgNotify()).not.toThrow();
    expect(runs).toBeLessThan(5); // coalesced, not unbounded
  });
});
