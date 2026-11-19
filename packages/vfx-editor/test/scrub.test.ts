// Numbers you drag or type (src/app/dom.ts): a typed comma works as the decimal point, a drag goes in whole steps, a value
// stays within its limits, rounded to its decimals, and shows with them (or only those it needs). The right panel's rows of
// two or three numbers (src/app/specform.ts): each box's prefix and full name.
import { describe, expect, it } from 'vitest';
import { dragSteps, fitValue, formatNumber, parseDecimal } from '../src/app/dom';
import { groupParts } from '../src/app/specform';

describe('a typed number', () => {
  it('takes a decimal point or a comma', () => {
    expect(parseDecimal('0.5')).toBe(0.5);
    expect(parseDecimal('0,5')).toBe(0.5);
    expect(parseDecimal(' 2,5 ')).toBe(2.5);
    expect(parseDecimal('14')).toBe(14);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('-0,25')).toBe(-0.25);
    expect(parseDecimal('3.')).toBe(3);
  });
  it('is no number when it is not written as one', () => {
    for (const s of ['', ' ', 'abc', '1,000.5', '1.2.3', '5 m', '--1', '0,5,']) expect(parseDecimal(s)).toBeNull();
  });
});

describe('a drag', () => {
  it('goes in whole steps of the pixels given, either way', () => {
    expect(dragSteps(0, 4)).toBe(0);
    expect(dragSteps(3, 4)).toBe(0);
    expect(dragSteps(4, 4)).toBe(1);
    expect(dragSteps(40, 4)).toBe(10);
    expect(dragSteps(-6, 4)).toBe(-1);
    // Shift counts each pixel ten times: 8 px is 80.
    expect(dragSteps(80, 4)).toBe(20);
  });
});

describe('a value', () => {
  it('stays within its limits, rounded to its decimals', () => {
    const distance = { min: 0, max: 14, digits: 1 };
    expect(fitValue(4 + 3 * 0.1, distance)).toBe(4.3);
    expect(fitValue(-3, distance)).toBe(0);
    expect(fitValue(20, distance)).toBe(14);
    expect(fitValue(2.46, distance)).toBe(2.5);
    expect(fitValue(7.25, { digits: 0 })).toBe(7);
  });
});

describe('a number as a box shows it', () => {
  it('has its decimals, or with trim only those it needs, and never "-0"', () => {
    expect(formatNumber(1, 2)).toBe('1.00');
    expect(formatNumber(1.2, 2)).toBe('1.20');
    expect(formatNumber(4, 1)).toBe('4.0');
    expect(formatNumber(0.5, 3, true)).toBe('0.5');
    expect(formatNumber(350, 3, true)).toBe('350');
    expect(formatNumber(0.12345, 3, true)).toBe('0.123');
    expect(formatNumber(100, 3, true)).toBe('100');
    expect(formatNumber(99.6, 0)).toBe('100');
    expect(formatNumber(-0.0001, 3, true)).toBe('0');
    expect(formatNumber(-0.0001, 2)).toBe('0.00');
    expect(formatNumber(-1440, 0)).toBe('-1440');
  });
});

describe('the boxes of two or three numbers on one row', () => {
  it('show a short prefix and have a full name; the row drops the words in brackets that the prefixes say', () => {
    expect(groupParts('burst', 'lifeMs', 'Life', 2)).toEqual({ shown: 'Life', boxes: [{ prefix: 'Min', name: 'Life, min' }, { prefix: 'Max', name: 'Life, max' }] });
    expect(groupParts('glow', 'grow', 'Size over life (start, peak, end)', 2)).toEqual({ shown: 'Size over life', boxes: [{ prefix: 'Start', name: 'Size over life, start' }, { prefix: 'End', name: 'Size over life, end' }] });
    expect(groupParts('smoke', 'grow', 'Size over life (start, peak, end)', 3).boxes.map((b) => b.prefix)).toEqual(['S', 'P', 'E']);
    expect(groupParts('flames', 'widthM', 'Width (start, end)', 2).boxes.map((b) => b.name)).toEqual(['Width, min', 'Width, max']);
    expect(groupParts('band', 'widthM', 'Width (start, end)', 2).boxes.map((b) => b.name)).toEqual(['Width, start', 'Width, end']);
    expect(groupParts('band', 'offset', 'offset', 3)).toEqual({ shown: 'offset', boxes: [{ prefix: 'R', name: 'Right' }, { prefix: 'U', name: 'Up' }, { prefix: 'F', name: 'Forward' }] });
  });
  it('keep the names the settings inventory gave a pair it does not know', () => {
    expect(groupParts('anim', 'steps', 'Steps', 2)).toEqual({ shown: 'Steps', boxes: [{ prefix: '1', name: 'Steps' }, { prefix: '2', name: 'Steps (2)' }] });
  });
});
