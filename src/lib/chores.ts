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
