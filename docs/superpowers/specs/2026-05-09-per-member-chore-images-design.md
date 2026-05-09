# Per-Member Chore Images Design

**Date:** 2026-05-09  
**Goal:** Generate unique, character-consistent DALL-E images per family member for each chore, using a rich base prompt and a per-member appearance description.

---

## Overview

Each chore image is personalised to the assigned member — a child with blonde hair gets a blonde character completing the chore; a child with dark hair gets a dark-haired one. Admins describe each member's appearance in a free-text field. Image generation fires automatically when a chore is created, once per assigned member.

---

## Data Layer

### New table: `chore_member_images`

```sql
CREATE TABLE IF NOT EXISTS chore_member_images (
  chore_id     INTEGER NOT NULL,
  member_id    INTEGER NOT NULL,
  image_path   TEXT,
  image_status TEXT NOT NULL DEFAULT 'pending',
  PRIMARY KEY (chore_id, member_id),
  FOREIGN KEY (chore_id)  REFERENCES chores(id)  ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
)
```

All new image generation writes here. The existing `chores.image_path` and `chores.image_status` columns are left untouched for backward compatibility — old chores retain their images; new ones use this table.

### Modified table: `members`

Add column:

```sql
ALTER TABLE members ADD COLUMN appearance TEXT NOT NULL DEFAULT ''
```

Applied via `ALTER TABLE … ADD COLUMN` in `getDb()` on startup (idempotent — safe to run against an existing database).

---

## API Changes

### `GET /api/chores`

- **Without `?member_id`** (used by admin ChoresTab): returns chores with an aggregate `image_status` computed from `chore_member_images` (pending > failed > ready — i.e. if any member is pending, status is pending). Returns `image_path` of the first ready member image as a preview thumbnail, or `null` if none ready. Falls back to `chores.image_status` / `chores.image_path` if no entries exist in `chore_member_images` (backward compat for pre-existing chores).
- **With `?member_id=X`**: returns member-specific `image_path` and `image_status` from `chore_member_images` for that member. Falls back to `chores.image_path` / `chores.image_status` if no entry exists.

### `POST /api/generate-image`

Request body: `{ chore_id, chore_name, member_id }`

Prompt construction:

```
[Base prompt — always included]
Create a kid-friendly chore-card style illustration on a pure white background. Use a clean, cheerful children's picture-book/vector cartoon style with simple shapes, soft pastel colours, bold but gentle outlines, smooth shading, and minimal clutter.

The character should have big expressive eyes, rosy cheeks, and a happy smile completing a simple household chore. Keep the character consistent across images for specific users.

The action should be obvious at a glance and clearly show what chore needs to be completed. Use only the essential objects needed to communicate the task. Keep the composition centred, uncluttered, polished, and suitable for a children's chores chart.

[Appended only when member has a non-empty appearance]
The character should look like: {appearance}. Keep this character consistent across all chore images for this child.

[Always appended]
The chore being completed is: {chore_name}.
```

Writes result to `public/chore-images/{chore_id}_{member_id}.png` and upserts into `chore_member_images`.

### `GET /api/members` + `POST /api/members` + `PUT /api/members`

Include `appearance` in all SELECT, INSERT, and UPDATE operations.

---

## Hook Changes

### `useChores(memberId, routine, date)`

`GET /api/chores` call gains `?member_id={memberId}` when `memberId` is not null. The `Chore` interface's `image_path` and `image_status` fields are now sourced from `chore_member_images` server-side — no change to the hook interface or ChoreCard.

---

## Component Changes

### `src/hooks/useMembers.ts`

Add `appearance: string` to the `Member` interface.

### `src/components/admin/MembersTab.tsx`

Add a textarea to the Add/Edit modal, below the colour picker:

- **Label:** "Appearance description"
- **Placeholder:** "e.g. blonde hair, blue eyes, wears a red shirt"
- **Bound to:** `editing.appearance`

### `src/components/admin/ChoresTab.tsx`

On new chore save, fire one `POST /api/generate-image` per assigned member (parallel, fire-and-forget):

```ts
for (const mid of editing.member_ids) {
  fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chore_id: created.id, chore_name: created.name, member_id: mid }),
  })
}
```

Retry button regenerates all members whose `image_status` is `'failed'` for that chore. The API returns enough information for ChoresTab to know which member images are failed.

Image status display in the chore list row:
- ⏳ if any member image is pending
- ⚠️ + Retry button if any failed (and none pending)
- Thumbnail of first ready image if all ready

---

## Error Handling

- Each per-member generation is independent — one member's failure does not affect others.
- Failed entries in `chore_member_images` have `image_status = 'failed'`; the Retry button re-fires generation for those entries only.
- If `OPENAI_API_KEY` is absent, generation fails gracefully with `image_status = 'failed'`.

---

## Out of Scope

- Regenerating images when a member's appearance description changes (admin can trigger manually via Retry).
- Per-member images for chores created before this feature (existing chores retain their current images unless manually retried).
