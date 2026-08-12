const ANNOUNCEMENTS_STORAGE_KEY = 'progquest_announcements_muted_v1';

/**
 * Whether the activity panel speaks.
 *
 * The panel announces its newest line to a polite live region roughly every three seconds, forever,
 * and there was no way to stop it. A sighted watcher can look away; a screen-reader user could only
 * silence their whole session, because the browser and the reader both offer a global mute and
 * nothing narrower — the app is the only thing that can decide what lands in its own region.
 *
 * A boolean rather than a per-category filter. The panel has one announcement, and a filter would be
 * a second vocabulary to keep in step with the first.
 *
 * Read through a guard for the same reason every other storage read here is: a browser with storage
 * disabled must lose the preference, not the panel. An unreadable value is treated as unmuted, so
 * the failure mode is the app talking rather than the app silently refusing to.
 */
function store(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readAnnouncementsMuted(storage: Pick<Storage, 'getItem'> | undefined = store()): boolean {
  try {
    return storage?.getItem(ANNOUNCEMENTS_STORAGE_KEY) === 'muted';
  } catch {
    return false;
  }
}

export function writeAnnouncementsMuted(muted: boolean, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = store()): void {
  try {
    if (muted) storage?.setItem(ANNOUNCEMENTS_STORAGE_KEY, 'muted');
    else storage?.removeItem(ANNOUNCEMENTS_STORAGE_KEY);
  } catch {
    // A preference that cannot be saved is still worth honouring for this session, so this is
    // deliberately silent rather than surfacing an error the player can do nothing about.
  }
}
