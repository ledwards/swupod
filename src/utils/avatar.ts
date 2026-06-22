// Centralized avatar resolution. Anything that renders a player avatar should go
// through avatarSrc() so a missing avatar ALWAYS gets a default "random temporary"
// one — the same Discord embed defaults draft assigns to bots. The pick is
// deterministic by seed (user id/name) so a given player keeps the same default.

const DEFAULT_AVATARS = [
  'https://cdn.discordapp.com/embed/avatars/0.png',
  'https://cdn.discordapp.com/embed/avatars/1.png',
  'https://cdn.discordapp.com/embed/avatars/2.png',
  'https://cdn.discordapp.com/embed/avatars/3.png',
  'https://cdn.discordapp.com/embed/avatars/4.png',
]

export function defaultAvatarUrl(seed?: string | null): string {
  const s = String(seed ?? '')
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
  }
  return DEFAULT_AVATARS[h % DEFAULT_AVATARS.length]
}

/**
 * Avatar src with a deterministic default fallback. Use everywhere an avatar
 * renders so a missing avatar always resolves to a temporary one.
 */
export function avatarSrc(src?: string | null, seed?: string | null): string {
  return src && src.length > 0 ? src : defaultAvatarUrl(seed)
}
