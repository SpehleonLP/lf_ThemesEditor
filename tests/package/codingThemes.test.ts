import { describe, it, expect } from 'vitest';
import {
  THEME_ROLES, THEME_KEYS, isThemeRole,
  rgbaToHex, hexToRgb, alphaOn, makeRgba, rgbaToCss, DEFAULT_ROLE_COLOR,
} from '../../src/package/codingThemes';

describe('coding theme roles', () => {
  it('lists the 18 roles in display order, starting Background, Text', () => {
    expect(THEME_ROLES).toHaveLength(18);
    expect(THEME_ROLES[0]).toBe('Background');
    expect(THEME_ROLES[1]).toBe('Text');
    expect(THEME_ROLES[THEME_ROLES.length - 1]).toBe('Preprocessor');
    expect(new Set(THEME_ROLES).size).toBe(18); // no dupes
  });

  it('isThemeRole recognizes roles and rejects the shipping bogus keys', () => {
    expect(isThemeRole('Keyword')).toBe(true);
    expect(isThemeRole('diffuse')).toBe(false);
    expect(isThemeRole('warp')).toBe(false);
  });

  it('exposes Light and Dark as the canonical theme keys', () => {
    expect(THEME_KEYS).toEqual(['Light', 'Dark']);
  });
});

describe('rgba <-> hex', () => {
  it('rgbaToHex clamps and rounds each channel to a byte, dropping alpha', () => {
    expect(rgbaToHex([1, 1, 1, 1])).toBe('#ffffff');
    expect(rgbaToHex([0, 0, 0, 0])).toBe('#000000');
    expect(rgbaToHex([0.5, 0, 0, 1])).toBe('#800000'); // round(127.5)=128
    expect(rgbaToHex([2, -1, 0.5, 1])).toBe('#ff0080'); // out-of-range clamps
  });

  it('hexToRgb parses with or without # and is case-insensitive', () => {
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToRgb('000000')).toEqual([0, 0, 0]);
    const [r] = hexToRgb('#FF0000');
    expect(r).toBe(1);
  });

  it('hexToRgb falls back to black on malformed input', () => {
    expect(hexToRgb('nope')).toEqual([0, 0, 0]);
    expect(hexToRgb('#abc')).toEqual([0, 0, 0]); // 3-digit not supported
  });

  it('round-trips a color through hex', () => {
    expect(rgbaToHex([...hexToRgb('#8c78dc'), 1])).toBe('#8c78dc');
  });
});

describe('1-bit alpha (RGB5551)', () => {
  it('alphaOn treats >= 0.5 as on', () => {
    expect(alphaOn(0)).toBe(false);
    expect(alphaOn(0.49)).toBe(false);
    expect(alphaOn(0.5)).toBe(true);
    expect(alphaOn(1)).toBe(true);
  });

  it('makeRgba assembles color + alpha bit', () => {
    expect(makeRgba('#ffffff', true)).toEqual([1, 1, 1, 1]);
    expect(makeRgba('#000000', false)).toEqual([0, 0, 0, 0]);
  });

  it('rgbaToCss renders transparent when the alpha bit is off', () => {
    expect(rgbaToCss([1, 1, 1, 0])).toBe('rgba(255, 255, 255, 0)');
    expect(rgbaToCss([1, 1, 1, 1])).toBe('rgba(255, 255, 255, 1)');
  });

  it('DEFAULT_ROLE_COLOR is an opaque light grey', () => {
    expect(DEFAULT_ROLE_COLOR).toEqual([0.8, 0.8, 0.8, 1]);
    expect(alphaOn(DEFAULT_ROLE_COLOR[3])).toBe(true);
  });
});
