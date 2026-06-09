# Chore Day-of-Week Filtering — Design Spec

## Goal

Allow each chore to be restricted to specific days of the week so it only appears in the chore grid on those days (e.g. "Friday mornings only").

## Architecture

A single integer column `days_of_week` is added to the `chores` table using a bitmask where bit N corresponds to `Date.getDay() === N` (bit 0 = Sunday, bit 1 = Monday, …, bit 6 = Saturday). The default value `127` (`0b1111111`) means all 7 days are enabled, preserving existing behaviour for all current chores with no data migration.

Filtering is done entirely on the client in `useChores` — no extra API endpoint or query parameter needed.

## Data Model

```sql
ALTER TABLE chores ADD COLUMN days_of_week INTEGER NOT NULL DEFAULT 127
```

- `127` = every day (default, backward-compatible)
- `62` = `0b0111110` = Mon–Fri only
- `65` = `0b1000001` = Sat + Sun only
- `32` = `0b0100000` = Friday only

## TypeScript Interface

```ts
export interface Chore {
  id: number
  name: string
  image_path: string | null
  image_status: 'pending' | 'ready' | 'failed'
  points: number
  routine: 'morning' | 'afternoon' | 'both'
  member_ids: number[]
  days_of_week: number   // bitmask, default 127
}
```

## Filtering Logic (`useChores`)

```ts
const dow = new Date().getDay() // 0=Sun … 6=Sat, local time

const chores = (allChores ?? []).filter(
  (c) =>
    memberId !== null &&
    c.member_ids.includes(memberId) &&
    (c.routine === routine || c.routine === 'both') &&
    ((c.days_of_week >> dow) & 1) === 1
)
```

## API Changes (`/api/chores`)

- **GET**: `days_of_week` included in every returned chore row (SQLite `SELECT *` already covers it after migration).
- **POST**: Accept `days_of_week` in request body; default to `127` if omitted.
- **PUT**: Accept and persist `days_of_week`; include in `UPDATE` statement.

## Admin UI (`ChoresTab`)

### Edit modal

Below the Morning / Afternoon / Both routine buttons, add a labelled row of 7 day-toggle buttons:

```
Days:  [ Su ][ Mo ][ Tu ][ We ][ Th ][ Fr ][ Sa ]
```

- All 7 lit (active) by default for new chores (`days_of_week = 127`).
- Clicking a day toggles its bit on/off.
- At least one day must remain selected (disallow toggling the last active day off).

### Chore list row

If `days_of_week === 127`, show nothing extra (every-day chores are the common case).  
If restricted, show a compact label alongside routine/points: e.g. `morning · 2pts · Mon Wed Fri`.

## Constraints

- Gold chores are unaffected — they are one-off bonus chores with no daily schedule.
- Completions, points, streaks, and all other systems are unaffected.
- The day abbreviations displayed are: `Su Mo Tu We Th Fr Sa` (index 0–6).

## Files Changed

| File | Change |
|---|---|
| `src/lib/db.ts` | Idempotent `ALTER TABLE chores ADD COLUMN days_of_week INTEGER NOT NULL DEFAULT 127` migration |
| `src/hooks/useChores.ts` | Add `days_of_week: number` to `Chore` interface; add bit-filter in `useChores` |
| `src/app/api/chores/route.ts` | Include `days_of_week` in POST and PUT; SELECT * already returns it |
| `src/components/admin/ChoresTab.tsx` | Day-picker in edit modal; conditional day summary in list row |
