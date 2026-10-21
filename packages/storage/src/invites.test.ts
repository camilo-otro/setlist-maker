import { describe, expect, it } from 'vitest';
import { InviteError, inviteTokenFromLink, previewInvite } from './invites';

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

describe('invite refusals', () => {
  const refusing = (body: unknown) => ({
    url: 'http://localhost:54321',
    key: 'sb_publishable_test',
    fetch: async () => ({ ok: false, status: 400, json: async () => body }),
  });

  it('explains in Spanish why the server refused, from its hint', async () => {
    const expired = refusing({
      code: 'P0001',
      message: 'This invite has expired.',
      hint: 'expired',
    });
    await expect(previewInvite(expired, TOKEN)).rejects.toThrow(
      new InviteError('Esta invitación ya venció. Pide una nueva.'),
    );
    const unknown = refusing({ code: 'P0002', message: "This invite link doesn't work" });
    await expect(previewInvite(unknown, TOKEN)).rejects.toThrow(
      'Este enlace de invitación no funciona.',
    );
  });
});
