/**
 * Returns true if a chore should appear on the given day of the week.
 *
 * @param daysOfWeek - Bitmask: bit 0 = Sunday, bit 1 = Monday, …, bit 6 = Saturday.
 *                     127 (0b1111111) means every day.
 * @param dow        - Day of week from Date.getDay(): 0 = Sunday … 6 = Saturday.
 */
export function isDayEnabled(daysOfWeek: number, dow: number): boolean {
  return ((daysOfWeek >> dow) & 1) === 1
}

/**
 * Preset colours available for chore note overlays, keyed by name.
 * The key is what's stored in the chore's `note_color` column.
 */
export const NOTE_COLORS: Record<string, string> = {
  yellow: '#facc15',
  blue: '#60a5fa',
  pink: '#f472b6',
  green: '#4ade80',
  orange: '#fb923c',
}

/**
 * Returns true if a chore's note overlay should be shown today.
 *
 * @param noteText       - The note's text. An empty (or whitespace-only) string
 *                          means no note is configured, so the overlay never shows.
 * @param noteDaysOfWeek - Bitmask using the same convention as isDayEnabled.
 * @param dow            - Day of week from Date.getDay(): 0 = Sunday … 6 = Saturday.
 */
export function isNoteVisible(noteText: string, noteDaysOfWeek: number, dow: number): boolean {
  return noteText.trim() !== '' && isDayEnabled(noteDaysOfWeek, dow)
}
