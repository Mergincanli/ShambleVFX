// Numbers you drag or type (src/app/dom.ts): a typed comma works as the decimal point, a drag goes in whole steps, and a value
// stays within its limits, rounded to its decimals.
import { describe, expect, it } from 'vitest';
import { dragSteps, fitValue, parseDecimal } from '../src/app/dom';

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
