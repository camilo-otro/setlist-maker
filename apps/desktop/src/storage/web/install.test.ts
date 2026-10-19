import { describe, expect, it } from 'vitest';
import { installAdvice } from './install';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

const base = {
  web: true,
  maxTouchPoints: 5,
  standalone: false,
  canPrompt: false,
  dismissed: false,
};

describe('installAdvice', () => {
  it('explains Add to Home Screen on iPhones and iPads, which iPadOS reports as a Mac', () => {
    expect(installAdvice({ ...base, userAgent: IPHONE })).toBe('ios');
    expect(installAdvice({ ...base, userAgent: IPAD_AS_MAC })).toBe('ios');
    expect(installAdvice({ ...base, userAgent: IPAD_AS_MAC, maxTouchPoints: 0 })).toBeNull();
  });

  it('offers an Install button where the browser can install the app', () => {
    expect(installAdvice({ ...base, userAgent: ANDROID, canPrompt: true })).toBe('prompt');
    expect(installAdvice({ ...base, userAgent: ANDROID })).toBeNull();
  });

  it('says nothing once installed, dismissed, or outside the web app', () => {
    expect(installAdvice({ ...base, userAgent: IPHONE, standalone: true })).toBeNull();
    expect(installAdvice({ ...base, userAgent: IPHONE, dismissed: true })).toBeNull();
    expect(installAdvice({ ...base, userAgent: IPHONE, web: false })).toBeNull();
  });
});
