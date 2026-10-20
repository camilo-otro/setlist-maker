/**
 * Share links (`/#<token>`) and invites (`/#join=<token>`) made before the viewer moved to
 * /viewer/ open the site's root, which is now the web app. They're in chats already, so they keep
 * working: this says where they go now. The app's own pages are `#/…`, so they never match.
 */
export function movedViewerLink(
  location: Pick<Location, 'origin' | 'pathname' | 'hash'>,
): string | null {
  const { origin, pathname, hash } = location;
  if (pathname !== '/' || hash.length < 2 || hash.startsWith('#/')) return null;
  return `${origin}/viewer/${hash}`;
}
