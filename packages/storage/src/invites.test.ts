import { describe, expect, it } from 'vitest';
import { inviteTokenFromLink } from './invites';

const TOKEN = 'O8lreegHO3EKDZuV9vVD-R9boJy4EJ9Dk2YbfclljBA';

describe('inviteTokenFromLink', () => {
  it('reads the token from an invite link, a bare token, or text around them', () => {
    expect(inviteTokenFromLink(`https://setlist.rockthehouse.app/#join=${TOKEN}`)).toBe(TOKEN);
    expect(inviteTokenFromLink(`  ${TOKEN}\n`)).toBe(TOKEN);
    expect(inviteTokenFromLink(`Join us! https://setlist.rockthehouse.app/#join=${TOKEN}`)).toBe(
      TOKEN,
    );
  });

  it("refuses text that isn't an invite, including share links", () => {
    expect(inviteTokenFromLink('hello')).toBeNull();
    expect(inviteTokenFromLink(`https://setlist.rockthehouse.app/#${TOKEN}`)).toBeNull();
    expect(inviteTokenFromLink('')).toBeNull();
  });
});
