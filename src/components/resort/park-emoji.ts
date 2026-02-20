// Match more specific park patterns first to avoid false matches.
// Order matters: "magic kingdom" must precede generic "resort",
// "epic universe" must precede "universal", etc.
const PARK_EMOJI_RULES: ReadonlyArray<{ match: RegExp; emoji: string }> = [
  { match: /magic kingdom|disneyland park/i, emoji: '🏰' },
  { match: /epcot/i, emoji: '🌐' },
  { match: /epic universe/i, emoji: '🌌' },
  { match: /universal/i, emoji: '🎢' },
  { match: /islands/i, emoji: '🏝️' },
  { match: /hollywood|studios/i, emoji: '🎬' },
  { match: /animal kingdom(?!.*lodge)/i, emoji: '🦁' },
  { match: /cruise|disney magic|disney wonder|disney dream|disney fantasy|disney wish|disney treasure/i, emoji: '🚢' },
  { match: /aulani/i, emoji: '🌺' },
  { match: /resort|hotel|lodge/i, emoji: '🏨' },
  { match: /water|aquatica|blizzard|typhoon|volcano/i, emoji: '🌊' },
  { match: /adventure|busch/i, emoji: '🎪' },
  { match: /legoland/i, emoji: '🧱' },
  { match: /springs|downtown disney/i, emoji: '🛍️' },
  { match: /seaworld/i, emoji: '🐬' },
]

export function getParkEmoji(parkName: string): string {
  for (const { match, emoji } of PARK_EMOJI_RULES) {
    if (match.test(parkName)) return emoji
  }
  return '🎡'
}
