# Chore Note Overlay — Design Spec

Date: 2026-06-14

## Summary

Add an optional, scheduled note overlay to individual chores. A note is a short
piece of text with a chosen colour that displays as a banner across the bottom
of the chore's image, shown only on configured days of the week.

**Motivating example:** Tyler's "Pack bag" chore appears every day
(`days_of_week = 127`), but on Fridays it should additionally show a note
"Pack library books" so he remembers his library books that day only.

## Data Model

Three new columns on the `chores` table, added via the same idempotent
migration pattern used for `days_of_week`:

```sql
ALTER TABLE chores ADD COLUMN note_text TEXT NOT NULL DEFAULT ''
ALTER TABLE chores ADD COLUMN note_color TEXT NOT NULL DEFAULT 'yellow'
ALTER TABLE chores ADD COLUMN note_days_of_week INTEGER NOT NULL DEFAULT 127
```

- `note_text`: empty string means "no note configured" — the overlay never
  shows regardless of `note_days_of_week`, even if it happens to be 127.
- `note_color`: a key into a small preset palette (see Admin UI section).
  Stored as a string key (e.g. `'yellow'`), not a raw hex value.
- `note_days_of_week`: bitmask, same convention as `days_of_week`
  (bit 0 = Sunday … bit 6 = Saturday, `Date.getDay()` order). Defaults to 127
  (all days) so a freshly-typed note shows every day until the admin
  restricts it.

**Visibility rule** (the single source of truth for whether the overlay
renders):

```
noteVisible = note_text.trim() !== '' && isDayEnabled(note_days_of_week, dow)
```

This is intentionally independent of the chore's own `days_of_week` /
`isDayEnabled(days_of_week, dow)` check, which controls whether the chore
*itself* appears at all. A chore can be visible every day while its note is
visible on only one of those days (Tyler's case), or a chore could be
restricted to weekdays while its note shows on a different subset — the two
schedules don't need to overlap or imply each other.

## Display Logic

### `useChores` hook (`src/hooks/useChores.ts`)

The hook already computes `dow = new Date().getDay()` for the existing
day-of-week chore filter. Reuse it to derive a `noteVisible` flag per chore:

```ts
const chores = (allChores ?? [])
  .filter(/* existing memberId/routine/days_of_week filter */)
  .map((c) => ({
    ...c,
    noteVisible: c.note_text.trim() !== '' && isDayEnabled(c.note_days_of_week, dow),
  }))
```

`Chore` interface additions:

```ts
export interface Chore {
  // ...existing fields
  note_text: string
  note_color: string
  note_days_of_week: number
  noteVisible: boolean // derived, not persisted
}
```

### `ChoreCard` (`src/components/ChoreCard.tsx`)

New optional props: `noteText: string`, `noteColor: string`,
`noteVisible: boolean`.

When `noteVisible` is true, render a banner overlay anchored to the bottom
edge of the image area (the cell above the name label), using the same
`absolute`-positioned overlay technique already used for the ✅ (completed)
and ⏳ (pending) overlays. The banner:

- Spans the full width of the image area
- Background colour = the resolved hex for `noteColor` (see palette below)
- Dark text (`#1a1a2e`) for contrast against the light pastel palette
- Sits at the bottom of the image cell, does not overlap the name label below
  it, and does not visually conflict with the centred ✅ completed overlay

Exact positioning (CSS) will be worked out against the existing
`gridTemplateRows: '1fr auto'` layout during implementation — this spec fixes
the *behaviour and data*, not pixel values.

### `ChoreGrid` (`src/components/ChoreGrid.tsx`)

Passes the three new props through from `Chore` to `ChoreCard`, same as all
other per-chore fields.

## Admin UI (`src/components/admin/ChoresTab.tsx`)

### `ChoreForm` type

```ts
type ChoreForm = {
  // ...existing fields
  note_text: string
  note_color: string
  note_days_of_week: number
}
```

Both `setEditing` call sites (new chore, edit chore) are updated to include
these fields — new chores default to `note_text: ''`, `note_color: 'yellow'`,
`note_days_of_week: 127`; editing an existing chore reads
`c.note_text ?? ''`, `c.note_color ?? 'yellow'`, `c.note_days_of_week ?? 127`
for backward compatibility with pre-migration rows.

### Edit modal additions

A new "Note" section is added below the existing "Days" picker, containing:

1. **Text input** for `note_text` (placeholder e.g. "Optional note, e.g. Pack library books")
2. **Colour swatches** — a row of preset colour buttons:

   | Key      | Hex       |
   |----------|-----------|
   | `yellow` | `#facc15` |
   | `blue`   | `#60a5fa` |
   | `pink`   | `#f472b6` |
   | `green`  | `#4ade80` |
   | `orange` | `#fb923c` |

   Clicking a swatch sets `note_color`. The selected swatch is highlighted
   (e.g. ring/border), matching the existing selected-state styling used for
   routine/day buttons.

3. **"Note shows on" day picker** — a second 7-button day-of-week picker,
   visually identical to the existing "Days" picker but operating on
   `note_days_of_week` via a generalized version of the existing `toggleDay`
   helper (parameterized by field name so it can toggle either
   `days_of_week` or `note_days_of_week`).

These controls remain visible and editable regardless of whether `note_text`
is empty — no conditional show/hide logic, keeping the UI simple and
predictable.

### Chore list row

When `note_text !== ''`, show a small coloured dot (using the resolved
`note_color` hex) followed by a short snippet of the note text, appended to
the existing info line (e.g. `morning · 1pt · Fr · 🟡 Pack library books`).

## API (`src/app/api/chores/route.ts`)

`ChoreRow` interface gains `note_text: string`, `note_color: string`,
`note_days_of_week: number`.

**POST**: destructure `note_text`, `note_color`, `note_days_of_week` from the
request body; insert with defaults `note_text ?? ''`, `note_color ?? 'yellow'`,
`note_days_of_week ?? 127`.

**PUT**: destructure the same three fields; update via
`COALESCE(?, note_text)`, `COALESCE(?, note_color)`,
`COALESCE(?, note_days_of_week)`, matching the existing pattern for
`days_of_week`, `image_status`, `image_path`.

**GET**: no changes — `SELECT *` already returns the new columns once the
migration runs.

## Testing

- **DB migration test** (`src/lib/__tests__/db.test.ts`): verify the three
  new columns exist on `chores` with the correct defaults
  (`''`, `'yellow'`, `127`).
- **Visibility logic test** (`src/lib/__tests__/chores.test.ts` or a new
  helper test): cover the `noteVisible` computation —
  - empty `note_text` → never visible, regardless of `note_days_of_week`
  - non-empty `note_text` + matching day bit → visible
  - non-empty `note_text` + non-matching day bit → not visible

The visibility rule is extracted into its own pure helper,
`isNoteVisible(noteText: string, noteDaysOfWeek: number, dow: number): boolean`,
in `src/lib/chores.ts` alongside `isDayEnabled`, and unit tested in isolation
the same way — `useChores` then calls it rather than re-implementing the
check inline.

## Out of Scope

- Multiple notes per chore (one note per chore only, per this spec)
- Per-member note targeting (notes apply to the whole chore, as agreed)
- Free-form colour picker (preset palette only)
- Notes on gold chores (this spec covers regular chores only)
