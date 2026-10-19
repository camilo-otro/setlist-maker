/** True on touch screens that have a system share sheet: phones, and tablets. */
export const canShareSheet = () =>
  typeof navigator.share === 'function' &&
  Boolean(window.matchMedia?.('(pointer: coarse)').matches);
