import { describe, it, expect } from 'vitest';
import { resolveLightTexCoord } from '../../src/bg/lightInput';

describe('resolveLightTexCoord', () => {
  it('uses the light texCoord when present', () => {
    expect(resolveLightTexCoord({ gradient: 'g', texCoord: 'spin' }, { texCoord: 'scroll' })).toBe('spin');
  });
  it('inherits the layer texCoord when the light has none', () => {
    expect(resolveLightTexCoord({ gradient: 'g' }, { texCoord: 'scroll' })).toBe('scroll');
  });
  it('returns null when neither has one', () => {
    expect(resolveLightTexCoord({ gradient: 'g' }, {})).toBeNull();
    expect(resolveLightTexCoord({ gradient: 'g' }, null)).toBeNull();
  });
  it('treats empty-string texCoord as absent', () => {
    expect(resolveLightTexCoord({ gradient: 'g', texCoord: '' }, { texCoord: 'scroll' })).toBe('scroll');
  });
});
