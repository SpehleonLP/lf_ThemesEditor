// tests/rc/state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  rcState, rcSubscribe, rcNotify, rcStructuralKey,
  selectRcTab, selectRcEntry, setTrigger, setTransport,
} from '../../src/rc/state';

beforeEach(() => {
  rcState.tab = 'curves';
  rcState.selected = { curves: null, events: null, splines1d: null, splines2d: null, gradients: null, sounds: null };
  rcState.playing = false; rcState.scrubSeconds = 0; rcState.loop = true;
  rcState.trigger = null; rcState.structuralNonce = 0; rcState.rev = 0;
});

describe('rc/state', () => {
  it('notifies subscribers', () => {
    let n = 0; rcSubscribe(() => n++); rcNotify(); expect(n).toBe(1);
  });

  it('structural key changes on tab switch and selection', () => {
    const k0 = rcStructuralKey();
    selectRcTab('events');
    expect(rcStructuralKey()).not.toBe(k0);
    const k1 = rcStructuralKey();
    selectRcEntry('events', 'Hover');
    expect(rcStructuralKey()).not.toBe(k1);
  });

  it('selectRcEntry stores per-tab selection', () => {
    selectRcEntry('splines1d', 'wobble');
    expect(rcState.selected.splines1d).toBe('wobble');
    expect(rcState.selected.events).toBeNull();
  });

  it('setTransport on unchanged values does not notify', () => {
    setTransport({ playing: false });
    let n = 0; rcSubscribe(() => n++);
    setTransport({ playing: false }); // identical → suppressed
    expect(n).toBe(0);
    setTransport({ playing: true });  // changed → notifies
    expect(n).toBe(1);
  });

  it('setTrigger is idempotent on an identical trigger', () => {
    setTrigger({ kind: 'event', name: 'Hover' });
    let n = 0; rcSubscribe(() => n++);
    setTrigger({ kind: 'event', name: 'Hover' });
    expect(n).toBe(0);
    setTrigger({ kind: 'event', name: 'Click' });
    expect(n).toBe(1);
  });

  it('a subscriber that calls setTransport does not recurse infinitely', () => {
    let runs = 0;
    rcSubscribe(() => { runs++; setTransport({ scrubSeconds: 1 }); });
    expect(() => rcNotify()).not.toThrow();
    expect(runs).toBeLessThan(5);
  });
});
