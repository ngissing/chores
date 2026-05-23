# Shopping List App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Next.js touchscreen kitchen app for managing a meal library, planning weekly dinners, and generating an AI-categorised shopping list sorted by supermarket aisle.

**Architecture:** Next.js 14 App Router with SQLite via `better-sqlite3` for local persistence. API routes serve as the backend; the frontend uses SWR for data fetching. Gemini (`@google/genai`) categorises ingredients into supermarket aisles once at save time, persisting the result.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, better-sqlite3, SWR, @google/genai (Gemini 1.5 Flash), Jest + ts-jest

---

## File Map

```
C:\Users\Nick Gissing\shopping-list-app\
├── data\                              # SQLite DB — gitignored
├── __tests__\
│   ├── parser.test.ts
│   └── week.test.ts
├── src\
│   ├── app\
│   │   ├── layout.tsx                 # Root HTML shell
│   │   ├── page.tsx                   # Mounts <App /> client component
│   │   ├── globals.css                # Tailwind + print styles
│   │   └── api\
│   │       ├── meals\
│   │       │   ├── route.ts           # GET list, POST create
│   │       │   └── [id]\route.ts      # PUT update, DELETE
│   │       ├── plan\route.ts          # GET week, PUT assign day
│   │       └── shopping\route.ts      # GET derived list
│   ├── components\
│   │   ├── App.tsx                    # Tab state, renders Shell
│   │   ├── Shell.tsx                  # Sidebar + content area layout
│   │   ├── PlanScreen.tsx             # 7-day card grid
│   │   ├── MealPicker.tsx             # Full-screen meal picker overlay
│   │   ├── MealsScreen.tsx            # Meal library grid
│   │   ├── MealEditSheet.tsx          # Add/edit meal modal
│   │   └── ShoppingScreen.tsx         # Aisle-grouped shopping list
│   ├── lib\
│   │   ├── db.ts                      # SQLite singleton + schema init
│   │   ├── parser.ts                  # Ingredient free-text parser
│   │   ├── week.ts                    # Current ISO week start
│   │   └── categorise.ts             # Gemini aisle classification
│   └── types\
│       └── index.ts                   # Shared TypeScript interfaces
├── .env.local                         # GEMINI_API_KEY
├── jest.config.ts
└── package.json
```

---

## Task 1: Scaffold the project

**Files:**
- Create: `C:\Users\Nick Gissing\shopping-list-app\` (entire project)

- [ ] **Step 1: Create Next.js 14 app**

```bash
cd C:\Users\Nick Gissing
npx create-next-app@14 shopping-list-app --typescript --eslint --tailwind --src-dir --app --import-alias "@/*" --use-npm
cd shopping-list-app
```

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install better-sqlite3 @google/genai swr
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D @types/better-sqlite3 ts-jest @types/jest jest jest-environment-node
```

- [ ] **Step 4: Create jest.config.ts**

```typescript
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: { module: 'CommonJS', moduleResolution: 'node' },
    }],
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};

export default config;
```

- [ ] **Step 5: Add scripts to package.json**

Open `package.json` and ensure the scripts block is:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "jest",
  "test:watch": "jest --watch"
}
```

- [ ] **Step 6: Create .env.local**

```
GEMINI_API_KEY=your_gemini_api_key_here
```

- [ ] **Step 7: Add data/ to .gitignore**

Append to `.gitignore`:
```
# SQLite database
data/
```

- [ ] **Step 8: Create data directory placeholder**

```bash
mkdir data
echo "" > data/.gitkeep
```

- [ ] **Step 9: Verify dev server starts**

```bash
npm run dev
```
Expected: server starts on http://localhost:3000 with no errors.

- [ ] **Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Next.js 14 shopping list app"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Create src/types/index.ts**

```typescript
// src/types/index.ts

export interface Meal {
  id: number;
  name: string;
  notes: string | null;
  created_at: string;
  ingredient_count: number;
}

export interface Ingredient {
  id: number;
  meal_id: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string;
  aisle_order: number;
}

export interface ParsedIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface DayPlan {
  day_of_week: number; // 0=Mon … 6=Sun
  meal_id: number | null;
  meal_name: string | null;
}

export interface ShoppingItem {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface ShoppingGroup {
  aisle: string;
  aisle_order: number;
  items: ShoppingItem[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Database singleton + schema

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Create src/lib/db.ts**

```typescript
// src/lib/db.ts
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'shopping.db');

declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      notes       TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id     INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      quantity    REAL,
      unit        TEXT,
      aisle       TEXT    NOT NULL DEFAULT 'Pantry & Dry Goods',
      aisle_order INTEGER NOT NULL DEFAULT 7
    );

    CREATE TABLE IF NOT EXISTS weekly_plan (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start   TEXT    NOT NULL,
      day_of_week  INTEGER NOT NULL,
      meal_id      INTEGER REFERENCES meals(id) ON DELETE SET NULL,
      UNIQUE(week_start, day_of_week)
    );
  `);
}

function getDb(): Database.Database {
  if (!global.__db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    global.__db = new Database(DB_PATH);
    global.__db.pragma('journal_mode = WAL');
    global.__db.pragma('foreign_keys = ON');
    initSchema(global.__db);
  }
  return global.__db;
}

export default getDb;
```

- [ ] **Step 2: Verify schema creates without errors**

```bash
npm run dev
```
Then in another terminal:
```bash
node -e "require('./src/lib/db.ts')"
```
If that fails due to ESM, verify via the Next.js server starting cleanly (schema init runs on first API call).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add SQLite singleton and schema"
```

---

## Task 4: Ingredient parser (TDD)

**Files:**
- Create: `src/lib/parser.ts`
- Create: `__tests__/parser.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/parser.test.ts
import { parseIngredientText } from '@/lib/parser';

describe('parseIngredientText', () => {
  it('parses number+unit+name with no space between number and unit', () => {
    expect(parseIngredientText('500g chicken breast')).toEqual([
      { quantity: 500, unit: 'g', name: 'chicken breast' },
    ]);
  });

  it('parses number + unit + name with spaces', () => {
    expect(parseIngredientText('2 cans tomatoes')).toEqual([
      { quantity: 2, unit: 'cans', name: 'tomatoes' },
    ]);
  });

  it('parses abbreviated units', () => {
    expect(parseIngredientText('1 tbsp olive oil')).toEqual([
      { quantity: 1, unit: 'tbsp', name: 'olive oil' },
    ]);
  });

  it('parses ingredient with no quantity', () => {
    expect(parseIngredientText('garlic')).toEqual([
      { quantity: null, unit: null, name: 'garlic' },
    ]);
  });

  it('splits comma-separated items', () => {
    const result = parseIngredientText('2 eggs, 100g butter');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ quantity: 2, unit: null, name: 'eggs' });
    expect(result[1]).toEqual({ quantity: 100, unit: 'g', name: 'butter' });
  });

  it('splits newline-separated items', () => {
    const result = parseIngredientText('1 kg beef\n3 cloves garlic');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ quantity: 1, unit: 'kg', name: 'beef' });
    expect(result[1]).toEqual({ quantity: 3, unit: 'cloves', name: 'garlic' });
  });

  it('ignores blank lines', () => {
    expect(parseIngredientText('\n  \n1 onion\n')).toHaveLength(1);
  });

  it('handles decimal quantities', () => {
    expect(parseIngredientText('0.5 tsp salt')).toEqual([
      { quantity: 0.5, unit: 'tsp', name: 'salt' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern=parser
```
Expected: FAIL — `Cannot find module '@/lib/parser'`

- [ ] **Step 3: Implement src/lib/parser.ts**

```typescript
// src/lib/parser.ts
import type { ParsedIngredient } from '@/types';

const UNITS = [
  'kg', 'g', 'ml', 'l',
  'tbsp', 'tsp',
  'cups?', 'oz', 'lbs?',
  'cans?', 'bunches?', 'cloves?',
  'pieces?', 'slices?', 'heads?', 'sprigs?',
];
const UNIT_RE = new RegExp(
  `^(\\d+(?:\\.\\d+)?)\\s*(${UNITS.join('|')})\\s+(.+)$`,
  'i',
);
const NO_UNIT_RE = /^(\d+(?:\.\d+)?)\s+(.+)$/;

function parseLine(line: string): ParsedIngredient {
  let m = line.match(UNIT_RE);
  if (m) return { quantity: parseFloat(m[1]), unit: m[2].toLowerCase(), name: m[3].trim() };
  m = line.match(NO_UNIT_RE);
  if (m) return { quantity: parseFloat(m[1]), unit: null, name: m[2].trim() };
  return { quantity: null, unit: null, name: line };
}

export function parseIngredientText(raw: string): ParsedIngredient[] {
  return raw
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseLine);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --testPathPattern=parser
```
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/parser.ts __tests__/parser.test.ts
git commit -m "feat: add ingredient text parser with tests"
```

---

## Task 5: Week utility (TDD)

**Files:**
- Create: `src/lib/week.ts`
- Create: `__tests__/week.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/week.test.ts
import { getWeekStart, DAY_LABELS } from '@/lib/week';

describe('getWeekStart', () => {
  it('returns Monday for a Wednesday', () => {
    // 2026-05-20 is a Wednesday
    expect(getWeekStart(new Date('2026-05-20'))).toBe('2026-05-18');
  });

  it('returns same day for a Monday', () => {
    // 2026-05-18 is a Monday
    expect(getWeekStart(new Date('2026-05-18'))).toBe('2026-05-18');
  });

  it('returns previous Monday for a Sunday', () => {
    // 2026-05-24 is a Sunday
    expect(getWeekStart(new Date('2026-05-24'))).toBe('2026-05-18');
  });
});

describe('DAY_LABELS', () => {
  it('has 7 entries starting with Mon', () => {
    expect(DAY_LABELS).toHaveLength(7);
    expect(DAY_LABELS[0]).toBe('Mon');
    expect(DAY_LABELS[6]).toBe('Sun');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern=week
```
Expected: FAIL — `Cannot find module '@/lib/week'`

- [ ] **Step 3: Implement src/lib/week.ts**

```typescript
// src/lib/week.ts

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --testPathPattern=week
```
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/week.ts __tests__/week.test.ts
git commit -m "feat: add week utility with tests"
```

---

## Task 6: Gemini categorise utility

**Files:**
- Create: `src/lib/categorise.ts`

- [ ] **Step 1: Create src/lib/categorise.ts**

```typescript
// src/lib/categorise.ts
import { GoogleGenAI } from '@google/genai';

const FALLBACK = { aisle: 'Pantry & Dry Goods', aisle_order: 7 } as const;

const VALID_AISLES: Record<string, number> = {
  'Produce': 1,
  'Meat & Seafood': 2,
  'Dairy': 3,
  'Deli': 4,
  'Bakery': 5,
  'Frozen': 6,
  'Pantry & Dry Goods': 7,
};

export async function categoriseIngredient(
  name: string,
): Promise<{ aisle: string; aisle_order: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return FALLBACK;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt =
      `Classify this grocery ingredient into exactly one supermarket aisle. ` +
      `Ingredient: "${name}". ` +
      `Respond with JSON only, no markdown: {"aisle":"<label>","aisle_order":<1-7>}. ` +
      `Valid labels and their order numbers: ` +
      `Produce=1, Meat & Seafood=2, Dairy=3, Deli=4, Bakery=5, Frozen=6, Pantry & Dry Goods=7.`;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    });

    const text = (response.text ?? '').trim().replace(/```json\n?|\n?```/g, '');
    const json = JSON.parse(text) as { aisle: string; aisle_order: number };

    if (typeof json.aisle === 'string' && json.aisle in VALID_AISLES) {
      return { aisle: json.aisle, aisle_order: VALID_AISLES[json.aisle] };
    }
  } catch {
    // silently fall through
  }

  return FALLBACK;
}
```

- [ ] **Step 2: Smoke-test categorisation manually (optional)**

```bash
node -e "
process.env.GEMINI_API_KEY = require('fs').readFileSync('.env.local','utf8').match(/GEMINI_API_KEY=(.+)/)[1].trim();
const { categoriseIngredient } = require('./src/lib/categorise.ts');
categoriseIngredient('chicken breast').then(console.log);
"
```
Expected (approximately): `{ aisle: 'Meat & Seafood', aisle_order: 2 }`

- [ ] **Step 3: Commit**

```bash
git add src/lib/categorise.ts
git commit -m "feat: add Gemini ingredient categorisation utility"
```

---

## Task 7: Meals API routes

**Files:**
- Create: `src/app/api/meals/route.ts`
- Create: `src/app/api/meals/[id]/route.ts`

- [ ] **Step 1: Create src/app/api/meals/route.ts**

```typescript
// src/app/api/meals/route.ts
import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { parseIngredientText } from '@/lib/parser';
import { categoriseIngredient } from '@/lib/categorise';
import type { Meal } from '@/types';

export async function GET(): Promise<NextResponse> {
  const db = getDb();
  const meals = db.prepare(`
    SELECT m.id, m.name, m.notes, m.created_at,
           COUNT(i.id) AS ingredient_count
    FROM meals m
    LEFT JOIN ingredients i ON i.meal_id = m.id
    GROUP BY m.id
    ORDER BY m.name ASC
  `).all() as Meal[];
  return NextResponse.json(meals);
}

export async function POST(req: Request): Promise<NextResponse> {
  const { name, notes, ingredientText } = await req.json() as {
    name: string;
    notes?: string;
    ingredientText: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const db = getDb();

  const mealId = (db.prepare(
    `INSERT INTO meals (name, notes) VALUES (?, ?) RETURNING id`
  ).get(name.trim(), notes ?? null) as { id: number }).id;

  const parsed = parseIngredientText(ingredientText ?? '');

  await Promise.all(parsed.map(async (p) => {
    const { aisle, aisle_order } = await categoriseIngredient(p.name);
    db.prepare(
      `INSERT INTO ingredients (meal_id, name, quantity, unit, aisle, aisle_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(mealId, p.name, p.quantity, p.unit, aisle, aisle_order);
  }));

  return NextResponse.json({ id: mealId }, { status: 201 });
}
```

- [ ] **Step 2: Create src/app/api/meals/[id]/route.ts**

```typescript
// src/app/api/meals/[id]/route.ts
import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { parseIngredientText } from '@/lib/parser';
import { categoriseIngredient } from '@/lib/categorise';

type Params = { params: { id: string } };

export async function PUT(req: Request, { params }: Params): Promise<NextResponse> {
  const id = Number(params.id);
  const { name, notes, ingredientText } = await req.json() as {
    name: string;
    notes?: string;
    ingredientText: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const db = getDb();
  const meal = db.prepare('SELECT id FROM meals WHERE id = ?').get(id);
  if (!meal) return NextResponse.json({ error: 'not found' }, { status: 404 });

  db.prepare('UPDATE meals SET name = ?, notes = ? WHERE id = ?').run(name.trim(), notes ?? null, id);
  db.prepare('DELETE FROM ingredients WHERE meal_id = ?').run(id);

  const parsed = parseIngredientText(ingredientText ?? '');
  await Promise.all(parsed.map(async (p) => {
    const { aisle, aisle_order } = await categoriseIngredient(p.name);
    db.prepare(
      `INSERT INTO ingredients (meal_id, name, quantity, unit, aisle, aisle_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, p.name, p.quantity, p.unit, aisle, aisle_order);
  }));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params): Promise<NextResponse> {
  const id = Number(params.id);
  const db = getDb();
  const meal = db.prepare('SELECT id FROM meals WHERE id = ?').get(id);
  if (!meal) return NextResponse.json({ error: 'not found' }, { status: 404 });
  db.prepare('DELETE FROM meals WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Manual test — create a meal**

With the dev server running (`npm run dev`):
```bash
curl -X POST http://localhost:3000/api/meals \
  -H "Content-Type: application/json" \
  -d '{"name":"Pasta Bolognese","ingredientText":"500g beef mince\n2 cans tomatoes\n1 onion\n3 cloves garlic\n200g spaghetti"}'
```
Expected: `{"id":1}` — takes a few seconds while Gemini classifies 5 ingredients.

- [ ] **Step 4: Manual test — list meals**

```bash
curl http://localhost:3000/api/meals
```
Expected: `[{"id":1,"name":"Pasta Bolognese","notes":null,"created_at":"...","ingredient_count":5}]`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/meals/
git commit -m "feat: add meals CRUD API routes"
```

---

## Task 8: Plan API route

**Files:**
- Create: `src/app/api/plan/route.ts`

- [ ] **Step 1: Create src/app/api/plan/route.ts**

```typescript
// src/app/api/plan/route.ts
import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { getWeekStart } from '@/lib/week';
import type { DayPlan } from '@/types';

export async function GET(): Promise<NextResponse> {
  const db = getDb();
  const weekStart = getWeekStart();

  // Ensure all 7 slots exist for the current week
  const upsertSlot = db.prepare(`
    INSERT OR IGNORE INTO weekly_plan (week_start, day_of_week, meal_id)
    VALUES (?, ?, NULL)
  `);
  for (let d = 0; d < 7; d++) upsertSlot.run(weekStart, d);

  const rows = db.prepare(`
    SELECT wp.day_of_week, wp.meal_id, m.name AS meal_name
    FROM weekly_plan wp
    LEFT JOIN meals m ON m.id = wp.meal_id
    WHERE wp.week_start = ?
    ORDER BY wp.day_of_week ASC
  `).all(weekStart) as DayPlan[];

  return NextResponse.json(rows);
}

export async function PUT(req: Request): Promise<NextResponse> {
  const { day_of_week, meal_id } = await req.json() as {
    day_of_week: number;
    meal_id: number | null;
  };

  if (day_of_week < 0 || day_of_week > 6) {
    return NextResponse.json({ error: 'day_of_week must be 0–6' }, { status: 400 });
  }

  const db = getDb();
  const weekStart = getWeekStart();

  db.prepare(`
    INSERT INTO weekly_plan (week_start, day_of_week, meal_id)
    VALUES (?, ?, ?)
    ON CONFLICT(week_start, day_of_week) DO UPDATE SET meal_id = excluded.meal_id
  `).run(weekStart, day_of_week, meal_id);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Manual test — fetch current week**

```bash
curl http://localhost:3000/api/plan
```
Expected: array of 7 objects, all `meal_id: null`.

- [ ] **Step 3: Manual test — assign a meal**

```bash
curl -X PUT http://localhost:3000/api/plan \
  -H "Content-Type: application/json" \
  -d '{"day_of_week":0,"meal_id":1}'
```
Expected: `{"ok":true}`

Then `curl http://localhost:3000/api/plan` — Monday entry should now show `"meal_id":1,"meal_name":"Pasta Bolognese"`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/plan/route.ts
git commit -m "feat: add weekly plan API route"
```

---

## Task 9: Shopping list API route

**Files:**
- Create: `src/app/api/shopping/route.ts`

- [ ] **Step 1: Create src/app/api/shopping/route.ts**

```typescript
// src/app/api/shopping/route.ts
import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { getWeekStart } from '@/lib/week';
import type { ShoppingGroup, ShoppingItem } from '@/types';

export async function GET(): Promise<NextResponse> {
  const db = getDb();
  const weekStart = getWeekStart();

  const rows = db.prepare(`
    SELECT i.name, i.quantity, i.unit, i.aisle, i.aisle_order
    FROM weekly_plan wp
    JOIN ingredients i ON i.meal_id = wp.meal_id
    WHERE wp.week_start = ? AND wp.meal_id IS NOT NULL
    ORDER BY i.aisle_order ASC, i.name ASC
  `).all(weekStart) as Array<{
    name: string; quantity: number | null; unit: string | null;
    aisle: string; aisle_order: number;
  }>;

  // Aggregate same ingredient+unit combos across meals
  const aggMap = new Map<string, ShoppingItem & { aisle: string; aisle_order: number }>();
  for (const row of rows) {
    const key = `${row.name.toLowerCase()}|${row.unit ?? ''}`;
    const existing = aggMap.get(key);
    if (existing) {
      if (existing.quantity !== null && row.quantity !== null) {
        existing.quantity += row.quantity;
      }
    } else {
      aggMap.set(key, {
        name: row.name, quantity: row.quantity, unit: row.unit,
        aisle: row.aisle, aisle_order: row.aisle_order,
      });
    }
  }

  // Group by aisle
  const groupMap = new Map<string, ShoppingGroup>();
  for (const item of aggMap.values()) {
    if (!groupMap.has(item.aisle)) {
      groupMap.set(item.aisle, { aisle: item.aisle, aisle_order: item.aisle_order, items: [] });
    }
    groupMap.get(item.aisle)!.items.push({
      name: item.name, quantity: item.quantity, unit: item.unit,
    });
  }

  const groups = [...groupMap.values()].sort((a, b) => a.aisle_order - b.aisle_order);
  return NextResponse.json(groups);
}
```

- [ ] **Step 2: Manual test — fetch shopping list**

```bash
curl http://localhost:3000/api/shopping
```
Expected: array of aisle groups, each with items. With Pasta Bolognese on Monday you should see beef mince in "Meat & Seafood", tomatoes/garlic/onion in "Produce", spaghetti in "Pantry & Dry Goods".

- [ ] **Step 3: Add clear-week endpoint to plan route**

Append to `src/app/api/plan/route.ts`:
```typescript
export async function DELETE(): Promise<NextResponse> {
  const db = getDb();
  const weekStart = getWeekStart();
  db.prepare(
    `UPDATE weekly_plan SET meal_id = NULL WHERE week_start = ?`
  ).run(weekStart);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/shopping/route.ts src/app/api/plan/route.ts
git commit -m "feat: add shopping list API and clear-week endpoint"
```

---

## Task 10: App shell + navigation

> **NOTE:** This task involves building the core UI layout. Invoke the `frontend-design` skill before implementing, providing this context: "Kitchen dashboard app shell. Left sidebar (~80px) with 3 large icon-only nav buttons (Plan 📅, Meals 🍽, Shopping 🛒) stacked vertically, touch targets ≥ 48px, active state highlighted. Content area fills remaining width. On mobile portrait: sidebar collapses to a fixed bottom tab bar with icon + label. Dark or clean neutral theme. Landscape-first."

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Create: `src/components/Shell.tsx`
- Create: `src/components/App.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update src/app/globals.css**

Replace content with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html, body {
    @apply h-full overflow-hidden;
  }
}

@media print {
  .no-print { display: none !important; }
  body { overflow: visible !important; height: auto !important; }
}
```

- [ ] **Step 2: Update src/app/layout.tsx**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shopping List',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create src/components/Shell.tsx**

Implement the shell using the frontend-design skill's output. The component signature must be:

```tsx
// src/components/Shell.tsx
'use client';

type Tab = 'plan' | 'meals' | 'shopping';

interface ShellProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  children: React.ReactNode;
}

export default function Shell({ activeTab, onTabChange, children }: ShellProps) {
  // frontend-design skill output goes here
}
```

- [ ] **Step 4: Create src/components/App.tsx**

```tsx
// src/components/App.tsx
'use client';

import { useState } from 'react';
import Shell from './Shell';
import PlanScreen from './PlanScreen';
import MealsScreen from './MealsScreen';
import ShoppingScreen from './ShoppingScreen';

type Tab = 'plan' | 'meals' | 'shopping';

export default function App() {
  const [tab, setTab] = useState<Tab>('plan');

  return (
    <Shell activeTab={tab} onTabChange={setTab}>
      {tab === 'plan' && <PlanScreen onNavigateToShopping={() => setTab('shopping')} />}
      {tab === 'meals' && <MealsScreen />}
      {tab === 'shopping' && <ShoppingScreen />}
    </Shell>
  );
}
```

- [ ] **Step 5: Update src/app/page.tsx**

```tsx
// src/app/page.tsx
import App from '@/components/App';

export default function Page() {
  return <App />;
}
```

- [ ] **Step 6: Create stub components (to unblock rendering)**

Create minimal stubs so the app compiles:

```tsx
// src/components/PlanScreen.tsx
'use client';
export default function PlanScreen({ onNavigateToShopping }: { onNavigateToShopping: () => void }) {
  return <div className="p-4">Plan Screen (stub)</div>;
}
```

```tsx
// src/components/MealsScreen.tsx
'use client';
export default function MealsScreen() {
  return <div className="p-4">Meals Screen (stub)</div>;
}
```

```tsx
// src/components/ShoppingScreen.tsx
'use client';
export default function ShoppingScreen() {
  return <div className="p-4">Shopping Screen (stub)</div>;
}
```

```tsx
// src/components/MealPicker.tsx
'use client';
import type { Meal } from '@/types';
interface MealPickerProps {
  meals: Meal[];
  onSelect: (meal: Meal) => void;
  onClose: () => void;
}
export default function MealPicker({ meals, onSelect, onClose }: MealPickerProps) {
  return <div>Meal Picker (stub)</div>;
}
```

```tsx
// src/components/MealEditSheet.tsx
'use client';
import type { Meal } from '@/types';
interface MealEditSheetProps {
  meal?: Meal;
  onSave: () => void;
  onClose: () => void;
}
export default function MealEditSheet({ meal, onSave, onClose }: MealEditSheetProps) {
  return <div>Meal Edit Sheet (stub)</div>;
}
```

- [ ] **Step 7: Verify app renders**

```bash
npm run dev
```
Open http://localhost:3000 — should show the Shell with sidebar/bottom-nav and stub screen text.

- [ ] **Step 8: Commit**

```bash
git add src/
git commit -m "feat: add app shell and navigation structure"
```

---

## Task 11: Weekly Plan screen + Meal Picker

> **NOTE:** Invoke the `frontend-design` skill for this task. Context: "Weekly plan screen for a kitchen touchscreen dashboard. 7 large tappable day cards in a row (Mon–Sun), each showing day label + assigned meal name or a big '+' if empty. Landscape, fills full content area. Tapping empty card opens a full-screen searchable meal picker overlay (dark scrim, scrollable list of meal cards, search bar at top). Tapping assigned card shows a small overlay with 'Change' and 'Remove' buttons. Fixed bottom bar with 'Generate Shopping List' CTA button, disabled when no meals assigned, enabled otherwise. Touch targets ≥ 48px."

**Files:**
- Modify: `src/components/PlanScreen.tsx`
- Modify: `src/components/MealPicker.tsx`

- [ ] **Step 1: Implement PlanScreen.tsx**

Component must:
- Fetch `/api/plan` via SWR
- Fetch `/api/meals` via SWR (for meal picker)
- Render 7 day cards
- On empty card tap: open `<MealPicker />`
- On assigned card tap: show inline "Change" / "Remove" options
- On meal select: `PUT /api/plan` then `mutate()` SWR key
- "Generate Shopping List" button calls `onNavigateToShopping` prop

```tsx
// src/components/PlanScreen.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import MealPicker from './MealPicker';
import { DAY_LABELS } from '@/lib/week';
import type { DayPlan, Meal } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function PlanScreen({ onNavigateToShopping }: { onNavigateToShopping: () => void }) {
  const { data: plan, mutate: mutatePlan } = useSWR<DayPlan[]>('/api/plan', fetcher);
  const { data: meals } = useSWR<Meal[]>('/api/meals', fetcher);
  const [pickerDay, setPickerDay] = useState<number | null>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null);

  async function assignMeal(dayOfWeek: number, mealId: number | null) {
    await fetch('/api/plan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: dayOfWeek, meal_id: mealId }),
    });
    mutatePlan();
  }

  const hasAnyMeal = plan?.some((d) => d.meal_id !== null) ?? false;

  return (
    // frontend-design skill output goes here, using the above logic
    // Key JSX structure:
    // <div className="flex flex-col h-full">
    //   <div className="flex-1 grid grid-cols-7 gap-3 p-4">
    //     {plan?.map((day) => <DayCard key={day.day_of_week} ... />)}
    //   </div>
    //   <div className="no-print p-4 border-t">
    //     <button disabled={!hasAnyMeal} onClick={onNavigateToShopping}>
    //       Generate Shopping List
    //     </button>
    //   </div>
    //   {pickerDay !== null && (
    //     <MealPicker meals={meals ?? []}
    //       onSelect={(m) => { assignMeal(pickerDay, m.id); setPickerDay(null); }}
    //       onClose={() => setPickerDay(null)} />
    //   )}
    // </div>
    <div className="p-4">Plan screen — implement with frontend-design skill</div>
  );
}
```

- [ ] **Step 2: Implement MealPicker.tsx**

Full-screen overlay with:
- Dark backdrop
- Search input (filters meals by name)
- Scrollable list of meals (tap to select)
- Close/Cancel button

```tsx
// src/components/MealPicker.tsx
'use client';

import { useState } from 'react';
import type { Meal } from '@/types';

interface MealPickerProps {
  meals: Meal[];
  onSelect: (meal: Meal) => void;
  onClose: () => void;
}

export default function MealPicker({ meals, onSelect, onClose }: MealPickerProps) {
  const [search, setSearch] = useState('');
  const filtered = meals.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );
  // frontend-design skill output goes here
  // Structure: full-screen fixed overlay, dark scrim, centred panel with
  // search input + scrollable filtered meal list
  return <div>Meal Picker — implement with frontend-design skill</div>;
}
```

- [ ] **Step 3: Test plan screen manually**

Open http://localhost:3000 — tap a day card, pick a meal, verify it updates. Tap assigned card, verify Change/Remove options. Verify "Generate Shopping List" enables only after assigning ≥1 meal.

- [ ] **Step 4: Commit**

```bash
git add src/components/PlanScreen.tsx src/components/MealPicker.tsx
git commit -m "feat: implement weekly plan screen and meal picker"
```

---

## Task 12: Meals Library screen + Edit Sheet

> **NOTE:** Invoke the `frontend-design` skill for this task. Context: "Meals library screen for kitchen dashboard. Responsive grid of meal cards (2 cols mobile, 4 cols landscape). Each card shows meal name + ingredient count. Large '+' FAB bottom-right. Tapping a card opens a slide-up sheet (mobile) or centred modal (landscape) with: editable meal name field, free-text textarea for ingredients (one per line or comma-separated, placeholder shows format examples), Save button, Delete button with confirmation. Touch targets ≥ 48px. During save show a loading state (ingredients are being AI-categorised)."

**Files:**
- Modify: `src/components/MealsScreen.tsx`
- Modify: `src/components/MealEditSheet.tsx`

- [ ] **Step 1: Implement MealsScreen.tsx**

```tsx
// src/components/MealsScreen.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import MealEditSheet from './MealEditSheet';
import type { Meal } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function MealsScreen() {
  const { data: meals, mutate } = useSWR<Meal[]>('/api/meals', fetcher);
  const [editingMeal, setEditingMeal] = useState<Meal | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);

  function openNew() { setEditingMeal(undefined); setSheetOpen(true); }
  function openEdit(meal: Meal) { setEditingMeal(meal); setSheetOpen(true); }
  function closeSheet() { setSheetOpen(false); mutate(); }

  // frontend-design skill output: grid of meal cards + FAB + sheet
  return <div className="p-4">Meals — implement with frontend-design skill</div>;
}
```

- [ ] **Step 2: Implement MealEditSheet.tsx**

The sheet must:
- Load existing ingredients as free text when editing (fetch `GET /api/meals` data — ingredient_count is available; for full ingredient list, add a detail route or fetch from the meal card data passed in)
- On save: `POST /api/meals` (new) or `PUT /api/meals/:id` (edit)
- Show loading spinner during save (Gemini categorisation takes 1–3s)
- On delete: `DELETE /api/meals/:id` with a confirm dialog

**Add ingredient detail to GET /api/meals first** — update `src/app/api/meals/route.ts` GET handler to also return a `raw_ingredients` text field by joining ingredients back into a display string:

```typescript
// In GET handler, replace the query with:
const meals = db.prepare(`
  SELECT m.id, m.name, m.notes, m.created_at,
         COUNT(i.id) AS ingredient_count,
         GROUP_CONCAT(
           CASE WHEN i.quantity IS NOT NULL
                THEN CAST(i.quantity AS TEXT) || COALESCE(' ' || i.unit, '') || ' ' || i.name
                ELSE i.name
           END, char(10)
         ) AS raw_ingredients
  FROM meals m
  LEFT JOIN ingredients i ON i.meal_id = m.id
  GROUP BY m.id
  ORDER BY m.name ASC
`).all() as (Meal & { raw_ingredients: string | null })[];
return NextResponse.json(meals);
```

Update `src/types/index.ts` — add `raw_ingredients` to `Meal`:
```typescript
export interface Meal {
  id: number;
  name: string;
  notes: string | null;
  created_at: string;
  ingredient_count: number;
  raw_ingredients: string | null;
}
```

Now implement `MealEditSheet.tsx`:
```tsx
// src/components/MealEditSheet.tsx
'use client';

import { useState } from 'react';
import type { Meal } from '@/types';

interface MealEditSheetProps {
  meal?: Meal;
  onSave: () => void;
  onClose: () => void;
}

export default function MealEditSheet({ meal, onSave, onClose }: MealEditSheetProps) {
  const [name, setName] = useState(meal?.name ?? '');
  const [ingredientText, setIngredientText] = useState(meal?.raw_ingredients ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const url = meal ? `/api/meals/${meal.id}` : '/api/meals';
    const method = meal ? 'PUT' : 'POST';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ingredientText }),
    });
    setSaving(false);
    onSave();
  }

  async function handleDelete() {
    await fetch(`/api/meals/${meal!.id}`, { method: 'DELETE' });
    onSave();
  }

  // frontend-design skill output: modal/sheet UI using above state + handlers
  return <div>Meal Edit Sheet — implement with frontend-design skill</div>;
}
```

- [ ] **Step 3: Test meals screen manually**

Open http://localhost:3000 → Meals tab. Add a new meal with several ingredients. Verify it appears in the grid with the correct ingredient count. Edit the meal. Delete a meal.

- [ ] **Step 4: Commit**

```bash
git add src/components/MealsScreen.tsx src/components/MealEditSheet.tsx src/app/api/meals/route.ts src/types/index.ts
git commit -m "feat: implement meals library screen and edit sheet"
```

---

## Task 13: Shopping List screen

> **NOTE:** Invoke the `frontend-design` skill for this task. Context: "Shopping list screen for kitchen dashboard. Read-only. Items grouped under bold aisle headings (Produce, Meat & Seafood, etc.) sorted by aisle order. Each item: ingredient name + quantity + unit (e.g. '500 g chicken breast'). Clean, high-contrast list, easy to read at a glance in a kitchen. 'Clear Week' button at top-right (shows confirmation before clearing). Print-friendly: when printed, hide navigation and show only the list."

**Files:**
- Modify: `src/components/ShoppingScreen.tsx`

- [ ] **Step 1: Implement ShoppingScreen.tsx**

```tsx
// src/components/ShoppingScreen.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { ShoppingGroup } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatQty(quantity: number | null, unit: string | null): string {
  if (quantity === null) return '';
  const q = Number.isInteger(quantity) ? quantity.toString() : quantity.toFixed(1);
  return unit ? `${q} ${unit}` : q;
}

export default function ShoppingScreen() {
  const { data: groups, mutate } = useSWR<ShoppingGroup[]>('/api/shopping', fetcher);
  const [confirming, setConfirming] = useState(false);

  async function clearWeek() {
    await fetch('/api/plan', { method: 'DELETE' });
    mutate();
    setConfirming(false);
  }

  const isEmpty = !groups || groups.length === 0;

  // frontend-design skill output: aisle-grouped list + clear week button
  return <div className="p-4">Shopping — implement with frontend-design skill</div>;
}
```

- [ ] **Step 2: Test shopping screen manually**

Open http://localhost:3000 → Shopping tab. Verify items appear grouped by aisle, sorted correctly. Verify "Clear Week" removes all assignments and empties the list. Print the page (Ctrl+P) and verify navigation is hidden.

- [ ] **Step 3: Commit**

```bash
git add src/components/ShoppingScreen.tsx
git commit -m "feat: implement shopping list screen"
```

---

## Task 14: Full integration test + production build

**Files:**
- No new files

- [ ] **Step 1: Run all tests**

```bash
npm test
```
Expected: PASS — all tests in `__tests__/`

- [ ] **Step 2: Run production build**

```bash
npm run build
```
Expected: Build completes with no errors. Note any TypeScript or lint warnings and fix them.

- [ ] **Step 3: End-to-end flow test**

1. Open http://localhost:3000
2. Go to **Meals** → add 3 meals, each with 4–6 ingredients
3. Go to **Plan** → assign a meal to Monday, Wednesday, Friday
4. Verify "Generate Shopping List" is enabled
5. Tap "Generate Shopping List" → verify Shopping screen shows items grouped by aisle
6. Verify duplicate ingredients from two meals are aggregated (add the same ingredient to two meals deliberately)
7. Verify "Clear Week" works and Shopping screen shows empty state
8. Resize to a narrow portrait viewport → verify bottom tab bar appears
9. Resize to landscape → verify left sidebar appears

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: shopping list app — complete implementation"
```
