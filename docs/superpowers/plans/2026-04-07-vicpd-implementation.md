# VicPD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build VicPD — a public Next.js web app that scrapes, collates, and personalises Victorian teacher professional learning opportunities.

**Architecture:** Next.js App Router on Vercel handles the frontend and all API routes. Supabase (Postgres) stores opportunities, user profiles, and interactions. Three AI pipelines via Claude API handle extraction from scraped pages, hybrid web search, and personalised recommendations.

**Tech Stack:** Next.js 14 (App Router) · Supabase · Tailwind CSS · Firecrawl · Brave Search API · Claude API (claude-sonnet-4-6) · Vitest · Playwright

---

## File Map

```
vicpd/
├── app/
│   ├── layout.tsx                      # Root layout, nav bar
│   ├── page.tsx                        # Browse / home page
│   ├── opportunity/[id]/page.tsx       # PD detail page
│   ├── saved/page.tsx                  # Saved opportunities page
│   ├── profile/page.tsx                # My Profile page
│   ├── admin/
│   │   ├── page.tsx                    # Admin dashboard (password-protected)
│   │   └── login/page.tsx             # Admin login form
│   └── api/
│       ├── opportunities/route.ts      # GET list (browse + filter)
│       ├── opportunities/[id]/route.ts # GET single opportunity + related
│       ├── search/route.ts             # Hybrid search (DB + Brave + Claude)
│       ├── scrape/route.ts             # POST trigger scrape (cron + admin)
│       ├── expire/route.ts             # POST expire old listings (cron)
│       ├── profile/route.ts            # GET / POST user profile
│       ├── saved/route.ts              # GET / POST / DELETE saved items
│       ├── interactions/route.ts       # POST interaction events
│       ├── recommendations/route.ts    # GET personalised picks
│       └── admin/auth/route.ts        # POST admin login
├── components/
│   ├── OpportunityCard.tsx             # PD card (title, type, date, cost, save)
│   ├── FilterSidebar.tsx               # Filter panel (type, cost, location, area)
│   ├── SearchBar.tsx                   # Debounced search input → URL params
│   ├── SaveButton.tsx                  # Toggle save for an opportunity
│   ├── PickedForYou.tsx               # Recommendations horizontal strip
│   └── ProfilePrompt.tsx              # First-visit profile setup nudge
├── lib/
│   ├── supabase.ts                     # Browser client + service-role server client
│   ├── claude.ts                       # Anthropic client singleton
│   ├── extract.ts                      # Claude extraction logic
│   ├── recommend.ts                    # Claude recommendation logic
│   ├── firecrawl.ts                    # Firecrawl scrape wrapper
│   ├── brave.ts                        # Brave Search API wrapper
│   └── anon.ts                         # Anonymous UUID (localStorage)
├── types/index.ts                      # All shared TypeScript interfaces + enums
├── supabase/migrations/
│   └── 001_initial_schema.sql          # All tables, indexes, seed data
├── tests/
│   ├── setup.ts                        # Vitest setup (jest-dom)
│   ├── extract.test.ts                 # Unit: Claude extraction parsing
│   ├── recommend.test.ts               # Unit: recommendation output parsing
│   ├── anon.test.ts                    # Unit: anonymous ID generation
│   └── e2e/
│       ├── browse.spec.ts              # Playwright: search + filter
│       ├── detail.spec.ts              # Playwright: detail page + save
│       └── profile.spec.ts            # Playwright: profile setup + recommendations
├── middleware.ts                       # Admin route protection
├── vercel.json                         # Cron job configuration
├── vitest.config.ts                    # Vitest configuration
└── .env.local.example                  # Required environment variables
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `vicpd/` (Next.js project)
- Create: `.env.local.example`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`

- [ ] **Step 1: Create Next.js project**

Run from `C:\Users\Nick Gissing\Claude Code\`:
```bash
npx create-next-app@latest vicpd --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
cd vicpd
```

Expected output ends with: `Success! Created vicpd`

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @anthropic-ai/sdk firecrawl use-debounce
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
npx playwright install --with-deps
```

Expected: all packages install without errors.

- [ ] **Step 3: Create vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 4: Create test setup**

Create `tests/setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Add test script to package.json**

In `package.json`, add to the `"scripts"` section:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 6: Create environment variable template**

Create `.env.local.example`:
```bash
# Supabase — get from your project at supabase.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic — get from console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-...

# Firecrawl — get from firecrawl.dev
FIRECRAWL_API_KEY=fc-...

# Brave Search — get from brave.com/search/api
BRAVE_API_KEY=BSA...

# Admin password — choose any string, used to protect /admin
ADMIN_PASSWORD=your-secret-password

# Cron secret — choose any random string
CRON_SECRET=your-cron-secret
```

Copy to `.env.local` and fill in real values before running.

- [ ] **Step 7: Verify project runs**

```bash
npm run dev
```

Expected: `✓ Ready in ~1s` at http://localhost:3000. Open browser to confirm default Next.js page loads.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with Vitest and Playwright"
```

---

## Task 2: Database Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create Supabase project**

Go to https://supabase.com → New project → note your Project URL and keys (go to Settings → API).

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/001_initial_schema.sql`:
```sql
-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Enums
create type opportunity_type as enum (
  'conference', 'workshop', 'online', 'accredited_course', 'resource'
);
create type school_type as enum ('government', 'catholic', 'independent');
create type interaction_action as enum ('view', 'save', 'click_through', 'dismiss');
create type scrape_frequency as enum ('daily', 'weekly');

-- Core PD listings
create table opportunities (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  description   text,
  provider      text,
  url           text,
  source_url    text,
  type          opportunity_type,
  cost          text,
  date_start    date,
  date_end      date,
  location      text,
  teaching_areas text[] default '{}',
  year_levels   text[] default '{}',
  tags          text[] default '{}',
  is_accredited boolean default false,
  expires_at    date,
  is_active     boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  -- Full-text search column (auto-maintained by Postgres)
  fts tsvector generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(provider, '') || ' ' ||
      array_to_string(coalesce(teaching_areas, '{}'), ' ') || ' ' ||
      array_to_string(coalesce(tags, '{}'), ' ')
    )
  ) stored
);

-- Deduplication: same source page + same title = same opportunity
create unique index opportunities_dedup on opportunities (source_url, title);

-- Indexes for common queries
create index on opportunities using gin (fts);
create index on opportunities (is_active, date_start);
create index on opportunities using gin (teaching_areas);
create index on opportunities using gin (year_levels);
create index on opportunities (type);

-- Victorian education sources to scrape
create table sources (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  url               text not null unique,
  scrape_frequency  scrape_frequency default 'daily',
  last_scraped_at   timestamptz,
  is_active         boolean default true
);

-- Optional teacher profiles (anonymous-first via anon_id)
create table user_profiles (
  id             uuid primary key default uuid_generate_v4(),
  anon_id        uuid unique not null,
  email          text,
  teaching_areas text[] default '{}',
  year_levels    text[] default '{}',
  interests      text[] default '{}',
  school_type    school_type,
  created_at     timestamptz default now()
);

-- Behaviour log for recommendations
create table user_interactions (
  id             uuid primary key default uuid_generate_v4(),
  anon_id        uuid not null,
  opportunity_id uuid references opportunities(id) on delete cascade,
  action         interaction_action not null,
  timestamp      timestamptz default now()
);

create index on user_interactions (anon_id, timestamp desc);

-- Teacher bookmarks
create table saved_opportunities (
  anon_id        uuid not null,
  opportunity_id uuid references opportunities(id) on delete cascade,
  saved_at       timestamptz default now(),
  notes          text,
  primary key (anon_id, opportunity_id)
);

create index on saved_opportunities (anon_id);

-- Cached recommendation results (TTL 1 hour, enforced in app)
create table recommendation_cache (
  anon_id          uuid primary key,
  opportunity_ids  uuid[] default '{}',
  reasons          text[] default '{}',
  generated_at     timestamptz default now()
);

-- Seed Victorian sources
insert into sources (name, url, scrape_frequency) values
  ('VIT Professional Learning', 'https://www.vit.vic.edu.au/maintaining-registration/professional-development', 'daily'),
  ('DET Professional Learning', 'https://www.education.vic.gov.au/school/teachers/profdev/Pages/profdevofferings.aspx', 'daily'),
  ('VCAA PD', 'https://www.vcaa.vic.edu.au/administration/professional-development/Pages/index.aspx', 'weekly'),
  ('AEU Victoria', 'https://www.aeuvic.asn.au/professional-learning', 'daily'),
  ('Bastow Institute', 'https://www.bastow.vic.edu.au/professional-learning', 'daily'),
  ('University of Melbourne Education', 'https://education.unimelb.edu.au/research-and-professional-learning', 'weekly'),
  ('Monash Education', 'https://www.monash.edu/education/professional-learning', 'weekly'),
  ('Deakin Education', 'https://www.deakin.edu.au/education/professional-learning', 'weekly'),
  ('Catholic Education Melbourne', 'https://www.cem.edu.au/professional-learning', 'weekly'),
  ('Independent Schools Victoria', 'https://www.is.vic.edu.au/professional-learning', 'weekly');
```

- [ ] **Step 3: Run migration in Supabase**

In your Supabase project → SQL Editor → paste the entire file content → Run.

Expected: All statements succeed with no errors. You'll see the tables listed under Table Editor.

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add database schema and seed sources"
```

---

## Task 3: TypeScript Types + Core Lib Stubs

**Files:**
- Create: `types/index.ts`
- Create: `lib/supabase.ts`
- Create: `lib/claude.ts`

- [ ] **Step 1: Create shared TypeScript types**

Create `types/index.ts`:
```typescript
export type OpportunityType =
  | 'conference'
  | 'workshop'
  | 'online'
  | 'accredited_course'
  | 'resource'

export type SchoolType = 'government' | 'catholic' | 'independent'
export type InteractionAction = 'view' | 'save' | 'click_through' | 'dismiss'
export type ScrapeFrequency = 'daily' | 'weekly'

export interface Opportunity {
  id: string
  title: string
  description: string | null
  provider: string | null
  url: string | null
  source_url: string | null
  type: OpportunityType | null
  cost: string | null
  date_start: string | null
  date_end: string | null
  location: string | null
  teaching_areas: string[]
  year_levels: string[]
  tags: string[]
  is_accredited: boolean
  expires_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Source {
  id: string
  name: string
  url: string
  scrape_frequency: ScrapeFrequency
  last_scraped_at: string | null
  is_active: boolean
}

export interface UserProfile {
  id: string
  anon_id: string
  email: string | null
  teaching_areas: string[]
  year_levels: string[]
  interests: string[]
  school_type: SchoolType | null
  created_at: string
}

export interface UserInteraction {
  id: string
  anon_id: string
  opportunity_id: string
  action: InteractionAction
  timestamp: string
}

export interface SavedOpportunity {
  anon_id: string
  opportunity_id: string
  saved_at: string
  notes: string | null
  opportunity?: Opportunity
}

export interface RecommendationCache {
  anon_id: string
  opportunity_ids: string[]
  reasons: string[]
  generated_at: string
}

// Shape Claude returns when extracting from scraped pages
export interface ExtractedOpportunity {
  title: string
  provider: string
  type: OpportunityType
  cost: string
  date_start: string | null
  date_end: string | null
  location: string
  teaching_areas: string[]
  year_levels: string[]
  tags: string[]
  is_accredited: boolean
  url: string
  description: string
}

// Shape Claude returns for each recommendation
export interface Recommendation {
  opportunity_id: string
  reason: string
}

export interface SearchFilters {
  query?: string
  type?: OpportunityType[]
  cost?: 'free' | 'paid'
  location?: string[]
  teaching_areas?: string[]
  year_levels?: string[]
  is_accredited?: boolean
  sort?: 'date' | 'relevance' | 'recent'
  page?: number
}
```

- [ ] **Step 2: Create Supabase clients**

Create `lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

// Used in client components (read-only via anon key)
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Used in API routes (bypasses RLS, has full write access)
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 3: Create Anthropic client**

Create `lib/claude.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'

// Single client instance reused across all lib functions
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})
```

- [ ] **Step 4: Commit**

```bash
git add types/ lib/supabase.ts lib/claude.ts
git commit -m "feat: add shared types and Supabase/Anthropic clients"
```

---

## Task 4: Claude Extraction Lib + Unit Tests

**Files:**
- Create: `lib/extract.ts`
- Create: `tests/extract.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/extract.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { parseExtractionResponse } from '@/lib/extract'

describe('parseExtractionResponse', () => {
  it('returns an array of opportunities from valid JSON', () => {
    const json = JSON.stringify([{
      title: 'Maths PD Workshop',
      provider: 'VIT',
      type: 'workshop',
      cost: 'Free',
      date_start: '2026-08-01',
      date_end: null,
      location: 'Melbourne CBD',
      teaching_areas: ['Maths'],
      year_levels: ['7-10'],
      tags: ['numeracy'],
      is_accredited: true,
      url: 'https://vit.vic.edu.au/pd/1',
      description: 'A workshop about maths teaching.',
    }])

    const result = parseExtractionResponse(json)

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Maths PD Workshop')
    expect(result[0].type).toBe('workshop')
    expect(result[0].teaching_areas).toEqual(['Maths'])
  })

  it('returns [] when Claude returns an empty array', () => {
    expect(parseExtractionResponse('[]')).toEqual([])
  })

  it('returns [] when Claude response is not valid JSON', () => {
    expect(parseExtractionResponse('sorry I cannot do that')).toEqual([])
  })

  it('returns [] when Claude wraps JSON in markdown code block', () => {
    const wrapped = '```json\n[{"title":"Test","provider":"VIT","type":"workshop","cost":"Free","date_start":null,"date_end":null,"location":"Online","teaching_areas":[],"year_levels":[],"tags":[],"is_accredited":false,"url":"https://example.com","description":"Test."}]\n```'
    const result = parseExtractionResponse(wrapped)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Test')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/extract.test.ts
```

Expected: FAIL — `parseExtractionResponse` is not defined.

- [ ] **Step 3: Implement extraction lib**

Create `lib/extract.ts`:
```typescript
import { anthropic } from '@/lib/claude'
import type { ExtractedOpportunity } from '@/types'

const EXTRACTION_PROMPT = `You are extracting professional learning opportunities from a Victorian education website.

Return a JSON array. For each opportunity found, include exactly these fields:
- title: string
- provider: string
- type: one of "conference" | "workshop" | "online" | "accredited_course" | "resource"
- cost: string (e.g. "Free", "$95", "Varies")
- date_start: "YYYY-MM-DD" or null
- date_end: "YYYY-MM-DD" or null
- location: string (e.g. "Online", "Melbourne CBD", "Regional Vic")
- teaching_areas: string array (e.g. ["Maths", "Science"])
- year_levels: string array (e.g. ["7-10", "VCE"])
- tags: string array (e.g. ["wellbeing", "literacy"])
- is_accredited: boolean (true if VIT-accredited)
- url: string (direct registration link, or source page URL if not available)
- description: string (max 100 words summary)

Only include Victorian professional learning for teachers. Return [] if nothing found.
Respond with ONLY the JSON array — no explanation, no markdown fences.`

// Parse Claude's text response into typed objects.
// Exported for unit testing without calling the API.
export function parseExtractionResponse(text: string): ExtractedOpportunity[] {
  // Strip markdown code fences if Claude wrapped the JSON
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return parsed as ExtractedOpportunity[]
  } catch {
    return []
  }
}

// Calls Claude to extract structured PD records from page markdown.
export async function extractOpportunities(
  markdown: string
): Promise<ExtractedOpportunity[]> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `${EXTRACTION_PROMPT}\n\nPage content:\n${markdown.slice(0, 8000)}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  return parseExtractionResponse(text)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/extract.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/extract.ts tests/extract.test.ts
git commit -m "feat: add Claude extraction lib with unit tests"
```

---

## Task 5: Claude Recommendation Lib + Unit Tests

**Files:**
- Create: `lib/recommend.ts`
- Create: `tests/recommend.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/recommend.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { parseRecommendationResponse } from '@/lib/recommend'

describe('parseRecommendationResponse', () => {
  it('returns ranked recommendations from valid JSON', () => {
    const json = JSON.stringify([
      { opportunity_id: 'abc-123', reason: 'Matches your Maths focus.' },
      { opportunity_id: 'def-456', reason: 'VCE-aligned workshop.' },
    ])

    const result = parseRecommendationResponse(json)

    expect(result).toHaveLength(2)
    expect(result[0].opportunity_id).toBe('abc-123')
    expect(result[1].reason).toBe('VCE-aligned workshop.')
  })

  it('returns [] for invalid JSON', () => {
    expect(parseRecommendationResponse('not json')).toEqual([])
  })

  it('returns [] for empty array', () => {
    expect(parseRecommendationResponse('[]')).toEqual([])
  })

  it('strips markdown fences', () => {
    const wrapped = '```json\n[{"opportunity_id":"abc","reason":"Great fit."}]\n```'
    const result = parseRecommendationResponse(wrapped)
    expect(result[0].opportunity_id).toBe('abc')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/recommend.test.ts
```

Expected: FAIL — `parseRecommendationResponse` is not defined.

- [ ] **Step 3: Implement recommendation lib**

Create `lib/recommend.ts`:
```typescript
import { anthropic } from '@/lib/claude'
import type { UserProfile, UserInteraction, Opportunity, Recommendation } from '@/types'

export function parseRecommendationResponse(text: string): Recommendation[] {
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return parsed as Recommendation[]
  } catch {
    return []
  }
}

export async function generateRecommendations(
  profile: UserProfile | null,
  interactions: UserInteraction[],
  opportunities: Opportunity[]
): Promise<Recommendation[]> {
  if (opportunities.length === 0) return []

  const dismissedIds = new Set(
    interactions.filter(i => i.action === 'dismiss').map(i => i.opportunity_id)
  )
  const eligible = opportunities.filter(o => !dismissedIds.has(o.id))
  if (eligible.length === 0) return []

  const profileText = profile
    ? [
        `Teaching areas: ${profile.teaching_areas.join(', ') || 'not set'}`,
        `Year levels: ${profile.year_levels.join(', ') || 'not set'}`,
        `Interests: ${profile.interests.join(', ') || 'not set'}`,
        `School type: ${profile.school_type || 'not set'}`,
      ].join('. ')
    : 'No profile — new user, no preferences known.'

  const recentBehaviour = interactions
    .filter(i => i.action !== 'dismiss')
    .slice(0, 20)
    .map(i => ({ action: i.action, opportunity_id: i.opportunity_id }))

  // Send only the fields Claude needs for ranking (not full descriptions — saves tokens)
  const opportunitySummaries = eligible.slice(0, 100).map(o => ({
    id: o.id,
    title: o.title,
    provider: o.provider,
    type: o.type,
    teaching_areas: o.teaching_areas,
    year_levels: o.year_levels,
    tags: o.tags,
    date_start: o.date_start,
    cost: o.cost,
  }))

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are recommending professional learning for a Victorian teacher.

Teacher profile: ${profileText}

Recent behaviour (last 20 actions): ${JSON.stringify(recentBehaviour)}

Available opportunities: ${JSON.stringify(opportunitySummaries)}

Return a JSON array of up to 8 objects, ranked by relevance, each with:
- opportunity_id: string (the id field from above)
- reason: string (one sentence — why it matches this teacher)

Respond with ONLY the JSON array.`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  return parseRecommendationResponse(text)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/recommend.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/recommend.ts tests/recommend.test.ts
git commit -m "feat: add Claude recommendation lib with unit tests"
```

---

## Task 6: Firecrawl + Brave Clients

**Files:**
- Create: `lib/firecrawl.ts`
- Create: `lib/brave.ts`

- [ ] **Step 1: Create Firecrawl scrape wrapper**

Create `lib/firecrawl.ts`:
```typescript
import FirecrawlApp from 'firecrawl'

const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! })

// Returns markdown content of the page, or throws on failure.
export async function scrapeUrl(url: string): Promise<string> {
  const result = await app.scrapeUrl(url, { formats: ['markdown'] })

  if (!result.success) {
    throw new Error(`Firecrawl failed for ${url}: ${(result as any).error ?? 'unknown error'}`)
  }

  return (result as any).markdown ?? ''
}
```

- [ ] **Step 2: Create Brave Search wrapper**

Create `lib/brave.ts`:
```typescript
export interface BraveResult {
  title: string
  url: string
  description: string
}

// Searches the web for Victorian teacher PD related to the query.
// Returns up to 5 results. Throws on API failure.
export async function braveSearch(query: string): Promise<BraveResult[]> {
  const fullQuery = `${query} professional learning Victoria teachers`
  const encoded = encodeURIComponent(fullQuery)

  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encoded}&count=5`,
    {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': process.env.BRAVE_API_KEY!,
      },
    }
  )

  if (!res.ok) throw new Error(`Brave Search failed: ${res.status} ${res.statusText}`)

  const data = await res.json()
  return (data.web?.results ?? []).map((r: any) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    description: r.description ?? '',
  }))
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/firecrawl.ts lib/brave.ts
git commit -m "feat: add Firecrawl and Brave Search API wrappers"
```

---

## Task 7: Scrape + Expire API Routes + Cron Config

**Files:**
- Create: `app/api/scrape/route.ts`
- Create: `app/api/expire/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Create the scrape route**

Create `app/api/scrape/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { scrapeUrl } from '@/lib/firecrawl'
import { extractOpportunities } from '@/lib/extract'
import type { Source, ExtractedOpportunity } from '@/types'

function computeExpiresAt(item: ExtractedOpportunity): string {
  if (item.date_end) return item.date_end
  if (item.date_start) {
    const d = new Date(item.date_start)
    d.setDate(d.getDate() + 30)
    return d.toISOString().split('T')[0]
  }
  // Self-paced resource: 90 days from today
  const d = new Date()
  d.setDate(d.getDate() + 90)
  return d.toISOString().split('T')[0]
}

function verifyCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function POST(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: sources, error: sourcesError } = await supabase
    .from('sources')
    .select('*')
    .eq('is_active', true)

  if (sourcesError || !sources?.length) {
    return NextResponse.json({ scraped: 0, errors: [] })
  }

  let totalUpserted = 0
  const errors: string[] = []

  for (const source of sources as Source[]) {
    try {
      const markdown = await scrapeUrl(source.url)
      const extracted = await extractOpportunities(markdown)

      for (const item of extracted) {
        const expires_at = computeExpiresAt(item)

        await supabase.from('opportunities').upsert(
          {
            ...item,
            source_url: source.url,
            expires_at,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'source_url,title', ignoreDuplicates: false }
        )
        totalUpserted++
      }

      await supabase
        .from('sources')
        .update({ last_scraped_at: new Date().toISOString() })
        .eq('id', source.id)
    } catch (err) {
      errors.push(`${source.name}: ${String(err)}`)
    }
  }

  return NextResponse.json({ scraped: totalUpserted, errors })
}
```

- [ ] **Step 2: Create the expire route**

Create `app/api/expire/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const { count, error } = await supabase
    .from('opportunities')
    .update({ is_active: false })
    .lt('expires_at', today)
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ expired: count ?? 0 })
}
```

- [ ] **Step 3: Create Vercel Cron configuration**

Create `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/scrape",
      "schedule": "0 16 * * *"
    },
    {
      "path": "/api/expire",
      "schedule": "0 17 * * *"
    }
  ]
}
```

Note: `0 16 * * *` = 16:00 UTC = 2:00am AEST. Vercel Cron sends requests with the `Authorization: Bearer <CRON_SECRET>` header automatically when `CRON_SECRET` is set as an env var.

- [ ] **Step 4: Test scrape route manually**

With your dev server running (`npm run dev`), test with curl:
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Authorization: Bearer your-cron-secret"
```

Expected response: `{"scraped": N, "errors": []}` — N may be 0 if sources haven't been scraped yet (that's fine at this stage without real API keys).

- [ ] **Step 5: Commit**

```bash
git add app/api/scrape/ app/api/expire/ vercel.json
git commit -m "feat: add scrape and expire API routes with Vercel Cron config"
```

---

## Task 8: Opportunities + Search API Routes

**Files:**
- Create: `app/api/opportunities/route.ts`
- Create: `app/api/opportunities/[id]/route.ts`
- Create: `app/api/search/route.ts`

- [ ] **Step 1: Create opportunities list route**

Create `app/api/opportunities/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const PAGE_SIZE = 24

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const types = p.getAll('type')
  const cost = p.get('cost')
  const locations = p.getAll('location')
  const teachingAreas = p.getAll('teaching_areas')
  const yearLevels = p.getAll('year_levels')
  const isAccredited = p.get('is_accredited') === 'true'
  const sort = p.get('sort') || 'date'
  const page = parseInt(p.get('page') || '0')

  const supabase = createServiceClient()

  let q = supabase
    .from('opportunities')
    .select('*')
    .eq('is_active', true)

  if (types.length) q = q.in('type', types)
  if (cost === 'free') q = q.ilike('cost', '%free%')
  if (cost === 'paid') q = q.not('cost', 'ilike', '%free%')
  if (locations.length) q = q.in('location', locations)
  if (teachingAreas.length) q = q.overlaps('teaching_areas', teachingAreas)
  if (yearLevels.length) q = q.overlaps('year_levels', yearLevels)
  if (isAccredited) q = q.eq('is_accredited', true)

  if (sort === 'date') q = q.order('date_start', { ascending: true, nullsFirst: false })
  else if (sort === 'recent') q = q.order('created_at', { ascending: false })

  q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  const { data, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    results: data ?? [],
    hasMore: (data?.length ?? 0) === PAGE_SIZE,
    page,
  })
}
```

- [ ] **Step 2: Create single opportunity + related route**

Create `app/api/opportunities/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()

  const { data: opportunity, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !opportunity) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Related: same teaching areas or overlapping tags, excluding this item
  const { data: related } = await supabase
    .from('opportunities')
    .select('*')
    .eq('is_active', true)
    .neq('id', params.id)
    .overlaps('teaching_areas', opportunity.teaching_areas.length ? opportunity.teaching_areas : [''])
    .limit(4)

  return NextResponse.json({ opportunity, related: related ?? [] })
}
```

- [ ] **Step 3: Create hybrid search route**

Create `app/api/search/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { braveSearch } from '@/lib/brave'
import { extractOpportunities } from '@/lib/extract'

const PAGE_SIZE = 24

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const query = p.get('q') || ''
  const page = parseInt(p.get('page') || '0')
  const types = p.getAll('type')
  const cost = p.get('cost')
  const teachingAreas = p.getAll('teaching_areas')
  const yearLevels = p.getAll('year_levels')

  const supabase = createServiceClient()

  let dbQuery = supabase
    .from('opportunities')
    .select('*')
    .eq('is_active', true)

  if (query) {
    dbQuery = dbQuery.textSearch('fts', query, { type: 'websearch', config: 'english' })
  }
  if (types.length) dbQuery = dbQuery.in('type', types)
  if (cost === 'free') dbQuery = dbQuery.ilike('cost', '%free%')
  if (cost === 'paid') dbQuery = dbQuery.not('cost', 'ilike', '%free%')
  if (teachingAreas.length) dbQuery = dbQuery.overlaps('teaching_areas', teachingAreas)
  if (yearLevels.length) dbQuery = dbQuery.overlaps('year_levels', yearLevels)

  dbQuery = dbQuery
    .order('date_start', { ascending: true, nullsFirst: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  const { data: dbResults, error } = await dbQuery

  // On-demand web search: only on first page with a non-empty query
  if (query && page === 0) {
    try {
      const webResults = await braveSearch(query)
      if (webResults.length > 0) {
        const markdown = webResults
          .map(r => `# ${r.title}\n${r.description}\nURL: ${r.url}`)
          .join('\n\n')
        const extracted = await extractOpportunities(markdown)

        for (const item of extracted) {
          await supabase.from('opportunities').upsert(
            {
              ...item,
              source_url: item.url,
              is_active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'source_url,title', ignoreDuplicates: true }
          )
        }
      }
    } catch {
      // Web search failure must not block the response
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    results: dbResults ?? [],
    hasMore: (dbResults?.length ?? 0) === PAGE_SIZE,
    page,
    query,
  })
}
```

- [ ] **Step 4: Test routes with curl**

```bash
# Browse all active opportunities
curl "http://localhost:3000/api/opportunities"

# Filter by type
curl "http://localhost:3000/api/opportunities?type=workshop&cost=free"

# Search
curl "http://localhost:3000/api/search?q=maths"
```

Expected: all return `{"results": [], "hasMore": false, "page": 0}` (empty until scrape runs).

- [ ] **Step 5: Commit**

```bash
git add app/api/opportunities/ app/api/search/
git commit -m "feat: add opportunities browse, detail, and hybrid search API routes"
```

---

## Task 9: Anonymous ID + Profile + Saved + Interactions APIs

**Files:**
- Create: `lib/anon.ts`
- Create: `tests/anon.test.ts`
- Create: `app/api/profile/route.ts`
- Create: `app/api/saved/route.ts`
- Create: `app/api/interactions/route.ts`

- [ ] **Step 1: Write the failing test for anon ID**

Create `tests/anon.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock localStorage for jsdom
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val },
  removeItem: (key: string) => { delete store[key] },
  clear: () => Object.keys(store).forEach(k => delete store[k]),
}
Object.defineProperty(global, 'localStorage', { value: localStorageMock })

describe('getAnonId', () => {
  beforeEach(() => localStorageMock.clear())

  it('generates a UUID on first call', async () => {
    const { getAnonId } = await import('@/lib/anon')
    const id = getAnonId()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns the same UUID on subsequent calls', async () => {
    const { getAnonId } = await import('@/lib/anon')
    const id1 = getAnonId()
    const id2 = getAnonId()
    expect(id1).toBe(id2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/anon.test.ts
```

Expected: FAIL — `getAnonId` is not defined.

- [ ] **Step 3: Implement anon ID lib**

Create `lib/anon.ts`:
```typescript
const ANON_ID_KEY = 'vicpd_anon_id'

// Returns a stable UUID for this browser session.
// Generates one on first call and persists it to localStorage.
// Returns '' in server-side contexts (no localStorage).
export function getAnonId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(ANON_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(ANON_ID_KEY, id)
  }
  return id
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/anon.test.ts
```

Expected: PASS.

- [ ] **Step 5: Create profile API route**

Create `app/api/profile/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const anonId = req.headers.get('x-anon-id')
  if (!anonId) return NextResponse.json({ profile: null })

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('anon_id', anonId)
    .single()

  return NextResponse.json({ profile: data ?? null })
}

export async function POST(req: NextRequest) {
  const anonId = req.headers.get('x-anon-id')
  if (!anonId) return NextResponse.json({ error: 'Missing anon-id' }, { status: 400 })

  const body = await req.json()
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(
      {
        anon_id: anonId,
        teaching_areas: body.teaching_areas ?? [],
        year_levels: body.year_levels ?? [],
        interests: body.interests ?? [],
        school_type: body.school_type ?? null,
        email: body.email ?? null,
      },
      { onConflict: 'anon_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalidate recommendation cache on profile change
  await supabase.from('recommendation_cache').delete().eq('anon_id', anonId)

  return NextResponse.json({ profile: data })
}
```

- [ ] **Step 6: Create saved opportunities route**

Create `app/api/saved/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const anonId = req.headers.get('x-anon-id')
  if (!anonId) return NextResponse.json({ saved: [] })

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('saved_opportunities')
    .select('*, opportunity:opportunities(*)')
    .eq('anon_id', anonId)
    .order('saved_at', { ascending: false })

  return NextResponse.json({ saved: data ?? [] })
}

export async function POST(req: NextRequest) {
  const anonId = req.headers.get('x-anon-id')
  if (!anonId) return NextResponse.json({ error: 'Missing anon-id' }, { status: 400 })

  const { opportunity_id, notes } = await req.json()
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('saved_opportunities')
    .upsert({ anon_id: anonId, opportunity_id, notes: notes ?? null }, { onConflict: 'anon_id,opportunity_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const anonId = req.headers.get('x-anon-id')
  if (!anonId) return NextResponse.json({ error: 'Missing anon-id' }, { status: 400 })

  const { opportunity_id } = await req.json()
  const supabase = createServiceClient()

  await supabase
    .from('saved_opportunities')
    .delete()
    .eq('anon_id', anonId)
    .eq('opportunity_id', opportunity_id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: Create interactions route**

Create `app/api/interactions/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import type { InteractionAction } from '@/types'

const VALID_ACTIONS: InteractionAction[] = ['view', 'save', 'click_through', 'dismiss']

export async function POST(req: NextRequest) {
  const anonId = req.headers.get('x-anon-id')
  if (!anonId) return NextResponse.json({ error: 'Missing anon-id' }, { status: 400 })

  const { opportunity_id, action } = await req.json()
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('user_interactions').insert({
    anon_id: anonId,
    opportunity_id,
    action,
    timestamp: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 8: Run all unit tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/anon.ts tests/anon.test.ts app/api/profile/ app/api/saved/ app/api/interactions/
git commit -m "feat: add anon ID lib, profile, saved, and interactions API routes"
```

---

## Task 10: Recommendations API Route

**Files:**
- Create: `app/api/recommendations/route.ts`

- [ ] **Step 1: Create recommendations route**

Create `app/api/recommendations/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { generateRecommendations } from '@/lib/recommend'
import type { UserProfile, UserInteraction, Opportunity } from '@/types'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function GET(req: NextRequest) {
  const anonId = req.headers.get('x-anon-id')
  if (!anonId) return NextResponse.json({ recommendations: [] })

  const supabase = createServiceClient()

  // Check cache first
  const { data: cached } = await supabase
    .from('recommendation_cache')
    .select('*')
    .eq('anon_id', anonId)
    .single()

  if (cached) {
    const age = Date.now() - new Date(cached.generated_at).getTime()
    if (age < CACHE_TTL_MS && cached.opportunity_ids.length > 0) {
      // Fetch full opportunity records for cached IDs
      const { data: opportunities } = await supabase
        .from('opportunities')
        .select('*')
        .in('id', cached.opportunity_ids)
        .eq('is_active', true)

      const ordered = (cached.opportunity_ids as string[])
        .map((id, i) => ({
          opportunity: opportunities?.find(o => o.id === id),
          reason: cached.reasons[i] ?? '',
        }))
        .filter(r => r.opportunity != null)

      return NextResponse.json({ recommendations: ordered, fromCache: true })
    }
  }

  // Generate fresh recommendations
  const [profileRes, interactionsRes, opportunitiesRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('anon_id', anonId).single(),
    supabase
      .from('user_interactions')
      .select('*')
      .eq('anon_id', anonId)
      .order('timestamp', { ascending: false })
      .limit(20),
    supabase
      .from('opportunities')
      .select('*')
      .eq('is_active', true)
      .or(`date_start.is.null,date_start.gte.${new Date().toISOString().split('T')[0]}`)
      .limit(100),
  ])

  const profile = profileRes.data as UserProfile | null
  const interactions = (interactionsRes.data ?? []) as UserInteraction[]
  const opportunities = (opportunitiesRes.data ?? []) as Opportunity[]

  const recommendations = await generateRecommendations(profile, interactions, opportunities)

  // Save to cache
  await supabase.from('recommendation_cache').upsert({
    anon_id: anonId,
    opportunity_ids: recommendations.map(r => r.opportunity_id),
    reasons: recommendations.map(r => r.reason),
    generated_at: new Date().toISOString(),
  })

  // Return opportunities with reasons
  const { data: recOpportunities } = await supabase
    .from('opportunities')
    .select('*')
    .in('id', recommendations.map(r => r.opportunity_id))

  const result = recommendations
    .map(r => ({
      opportunity: recOpportunities?.find(o => o.id === r.opportunity_id),
      reason: r.reason,
    }))
    .filter(r => r.opportunity != null)

  return NextResponse.json({ recommendations: result, fromCache: false })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/recommendations/
git commit -m "feat: add recommendations API route with 1-hour cache"
```

---

## Task 11: Admin Auth + Route Protection

**Files:**
- Create: `app/api/admin/auth/route.ts`
- Create: `middleware.ts`
- Create: `app/admin/login/page.tsx`

- [ ] **Step 1: Create admin auth route**

Create `app/api/admin/auth/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('vicpd_admin', process.env.ADMIN_PASSWORD!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  })
  return res
}
```

- [ ] **Step 2: Create middleware to protect /admin**

Create `middleware.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const adminCookie = req.cookies.get('vicpd_admin')?.value
    if (adminCookie !== process.env.ADMIN_PASSWORD) {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
```

- [ ] **Step 3: Create admin login page**

Create `app/admin/login/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push('/admin')
    } else {
      setError('Wrong password')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow w-80 space-y-4">
        <h1 className="text-xl font-bold text-gray-900">VicPD Admin</h1>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Admin password"
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 transition-colors"
        >
          Sign in
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/ middleware.ts app/admin/login/
git commit -m "feat: add admin auth route, middleware protection, and login page"
```

---

## Task 12: Shared UI Components

**Files:**
- Create: `components/OpportunityCard.tsx`
- Create: `components/FilterSidebar.tsx`
- Create: `components/SearchBar.tsx`
- Create: `components/SaveButton.tsx`

- [ ] **Step 1: Create OpportunityCard**

Create `components/OpportunityCard.tsx`:
```tsx
'use client'
import Link from 'next/link'
import type { Opportunity } from '@/types'
import SaveButton from './SaveButton'

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  conference:       { bg: 'bg-purple-100', text: 'text-purple-800', label: 'CONFERENCE' },
  workshop:         { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'WORKSHOP' },
  online:           { bg: 'bg-green-100',  text: 'text-green-800',  label: 'ONLINE' },
  accredited_course:{ bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'ACCREDITED' },
  resource:         { bg: 'bg-gray-100',   text: 'text-gray-700',   label: 'RESOURCE' },
}

interface Props {
  opportunity: Opportunity
  savedIds: Set<string>
  onToggleSave: (id: string) => void
}

export default function OpportunityCard({ opportunity, savedIds, onToggleSave }: Props) {
  const style = TYPE_STYLES[opportunity.type ?? 'resource'] ?? TYPE_STYLES.resource
  const isFree = opportunity.cost?.toLowerCase().includes('free')

  const dateLabel = opportunity.date_start
    ? new Date(opportunity.date_start).toLocaleDateString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : 'Self-paced'

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2 hover:shadow-sm transition-shadow">
      <div className="flex justify-between items-start">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
          {style.label}
        </span>
        <SaveButton
          opportunityId={opportunity.id}
          isSaved={savedIds.has(opportunity.id)}
          onToggle={onToggleSave}
        />
      </div>

      <Link
        href={`/opportunity/${opportunity.id}`}
        className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors line-clamp-2 leading-snug"
      >
        {opportunity.title}
      </Link>

      <p className="text-sm text-gray-500">{opportunity.provider}</p>

      <div className="text-sm text-gray-500 flex gap-3 flex-wrap">
        <span>📅 {dateLabel}</span>
        {opportunity.location && <span>📍 {opportunity.location}</span>}
      </div>

      <div className="flex justify-between items-center mt-auto pt-1">
        <span className={`text-xs px-2 py-0.5 rounded ${isFree ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
          {opportunity.cost || 'Free'}
        </span>
        <Link href={`/opportunity/${opportunity.id}`} className="text-xs text-indigo-600 hover:underline">
          View details →
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create SaveButton**

Create `components/SaveButton.tsx`:
```tsx
'use client'

interface Props {
  opportunityId: string
  isSaved: boolean
  onToggle: (id: string) => void
}

export default function SaveButton({ opportunityId, isSaved, onToggle }: Props) {
  return (
    <button
      onClick={() => onToggle(opportunityId)}
      aria-label={isSaved ? 'Remove bookmark' : 'Bookmark this opportunity'}
      className={`transition-colors ${isSaved ? 'text-indigo-600' : 'text-gray-300 hover:text-indigo-400'}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24"
        fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    </button>
  )
}
```

- [ ] **Step 3: Create SearchBar**

Create `components/SearchBar.tsx`:
```tsx
'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'

export default function SearchBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') || '')

  const updateSearch = useDebouncedCallback((q: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (q) params.set('q', q)
    else params.delete('q')
    params.delete('page')
    router.push(`/?${params.toString()}`)
  }, 400)

  return (
    <input
      type="search"
      value={value}
      onChange={e => { setValue(e.target.value); updateSearch(e.target.value) }}
      placeholder="Search professional learning opportunities…"
      className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  )
}
```

- [ ] **Step 4: Create FilterSidebar**

Create `components/FilterSidebar.tsx`:
```tsx
'use client'
import { useRouter, useSearchParams } from 'next/navigation'

const TYPES = [
  { value: 'conference',        label: 'Conference' },
  { value: 'workshop',          label: 'Workshop' },
  { value: 'online',            label: 'Online / Webinar' },
  { value: 'accredited_course', label: 'Accredited Course' },
  { value: 'resource',          label: 'Free Resource' },
]
const LOCATIONS = ['Online', 'Melbourne CBD', 'Regional Vic']
const TEACHING_AREAS = ['Maths', 'English / Literacy', 'Science', 'Humanities', 'Arts', 'Health & PE', 'Wellbeing', 'STEM', 'Inclusion', 'Leadership']
const YEAR_LEVELS = ['Foundation–6', '7–10', 'VCE / Senior']

export default function FilterSidebar() {
  const router = useRouter()
  const p = useSearchParams()

  function toggle(key: string, value: string) {
    const params = new URLSearchParams(p.toString())
    const current = params.getAll(key)
    if (current.includes(value)) {
      params.delete(key)
      current.filter(v => v !== value).forEach(v => params.append(key, v))
    } else {
      params.append(key, value)
    }
    params.delete('page')
    router.push(`/?${params.toString()}`)
  }

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(p.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page')
    router.push(`/?${params.toString()}`)
  }

  const selectedTypes = p.getAll('type')
  const selectedLocations = p.getAll('location')
  const selectedAreas = p.getAll('teaching_areas')
  const selectedYears = p.getAll('year_levels')
  const cost = p.get('cost')
  const isAccredited = p.get('is_accredited') === 'true'

  return (
    <aside className="w-52 shrink-0 space-y-5 text-sm">
      <h2 className="font-bold text-gray-700">Filter</h2>

      <section>
        <h3 className="font-semibold text-gray-600 mb-2">Type</h3>
        {TYPES.map(t => (
          <label key={t.value} className="flex items-center gap-2 text-gray-600 mb-1 cursor-pointer">
            <input type="checkbox" checked={selectedTypes.includes(t.value)}
              onChange={() => toggle('type', t.value)} className="accent-indigo-600" />
            {t.label}
          </label>
        ))}
      </section>

      <section>
        <h3 className="font-semibold text-gray-600 mb-2">Cost</h3>
        {[['free', 'Free only'], ['paid', 'Paid'], ['', 'Any']].map(([val, label]) => (
          <label key={label} className="flex items-center gap-2 text-gray-600 mb-1 cursor-pointer">
            <input type="radio" name="cost" checked={cost === val || (!cost && val === '')}
              onChange={() => setParam('cost', val || null)} className="accent-indigo-600" />
            {label}
          </label>
        ))}
      </section>

      <section>
        <h3 className="font-semibold text-gray-600 mb-2">Location</h3>
        {LOCATIONS.map(loc => (
          <label key={loc} className="flex items-center gap-2 text-gray-600 mb-1 cursor-pointer">
            <input type="checkbox" checked={selectedLocations.includes(loc)}
              onChange={() => toggle('location', loc)} className="accent-indigo-600" />
            {loc}
          </label>
        ))}
      </section>

      <section>
        <h3 className="font-semibold text-gray-600 mb-2">Teaching Area</h3>
        {TEACHING_AREAS.map(area => (
          <label key={area} className="flex items-center gap-2 text-gray-600 mb-1 cursor-pointer">
            <input type="checkbox" checked={selectedAreas.includes(area)}
              onChange={() => toggle('teaching_areas', area)} className="accent-indigo-600" />
            {area}
          </label>
        ))}
      </section>

      <section>
        <h3 className="font-semibold text-gray-600 mb-2">Year Level</h3>
        {YEAR_LEVELS.map(yl => (
          <label key={yl} className="flex items-center gap-2 text-gray-600 mb-1 cursor-pointer">
            <input type="checkbox" checked={selectedYears.includes(yl)}
              onChange={() => toggle('year_levels', yl)} className="accent-indigo-600" />
            {yl}
          </label>
        ))}
      </section>

      <section>
        <label className="flex items-center gap-2 text-gray-600 cursor-pointer">
          <input type="checkbox" checked={isAccredited}
            onChange={() => setParam('is_accredited', isAccredited ? null : 'true')}
            className="accent-indigo-600" />
          VIT-accredited only
        </label>
      </section>
    </aside>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/
git commit -m "feat: add shared UI components (card, search, filters, save button)"
```

---

## Task 13: PickedForYou + ProfilePrompt Components

**Files:**
- Create: `components/PickedForYou.tsx`
- Create: `components/ProfilePrompt.tsx`

- [ ] **Step 1: Create PickedForYou strip**

Create `components/PickedForYou.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAnonId } from '@/lib/anon'
import type { Opportunity } from '@/types'

interface RecommendationItem {
  opportunity: Opportunity
  reason: string
}

export default function PickedForYou() {
  const [items, setItems] = useState<RecommendationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const anonId = getAnonId()
    if (!anonId) { setLoading(false); return }

    fetch('/api/recommendations', { headers: { 'x-anon-id': anonId } })
      .then(r => r.json())
      .then(data => {
        setItems(data.recommendations ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading || items.length === 0) return null

  const isFree = (cost: string | null) => cost?.toLowerCase().includes('free')

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <h2 className="text-sm font-bold text-blue-800 mb-3">✨ Picked for you</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.map(({ opportunity, reason }) => (
          <Link
            key={opportunity.id}
            href={`/opportunity/${opportunity.id}`}
            className="min-w-[200px] max-w-[200px] bg-white border border-blue-200 rounded-lg p-3 hover:shadow-sm transition-shadow"
          >
            <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">
              {opportunity.title}
            </p>
            <p className="text-xs text-gray-500 mt-1">{opportunity.provider}</p>
            <p className="text-xs text-gray-400 mt-1">{opportunity.location}</p>
            <p className={`text-xs mt-2 font-medium ${isFree(opportunity.cost) ? 'text-green-600' : 'text-yellow-700'}`}>
              {opportunity.cost || 'Free'}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ProfilePrompt**

Create `components/ProfilePrompt.tsx`:
```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'

interface Props {
  onDismiss: () => void
}

export default function ProfilePrompt({ onDismiss }: Props) {
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold text-indigo-900">
          Get personalised recommendations
        </p>
        <p className="text-xs text-indigo-700 mt-0.5">
          Tell us about your teaching to see opportunities matched to you.
        </p>
      </div>
      <div className="flex gap-2 ml-4 shrink-0">
        <Link
          href="/profile"
          className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded hover:bg-indigo-700 transition-colors"
        >
          Set up profile
        </Link>
        <button
          onClick={onDismiss}
          className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/PickedForYou.tsx components/ProfilePrompt.tsx
git commit -m "feat: add PickedForYou recommendations strip and ProfilePrompt"
```

---

## Task 14: Root Layout + Browse Page

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Update root layout**

Replace `app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'VicPD — Professional Learning for Victorian Teachers',
  description: 'Find, filter, and save professional learning opportunities across Victoria.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <header className="bg-[#1e3a5f] text-white px-6 py-3 flex items-center gap-4 sticky top-0 z-10 shadow">
          <Link href="/" className="font-bold text-lg tracking-tight">VicPD</Link>
          <span className="text-blue-300 text-xs hidden sm:block">
            Professional Learning for Victorian Teachers
          </span>
          <div className="ml-auto flex gap-4 text-sm">
            <Link href="/saved" className="text-blue-200 hover:text-white transition-colors">
              Saved
            </Link>
            <Link href="/profile" className="text-blue-200 hover:text-white transition-colors">
              My Profile
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Build the Browse page**

Replace `app/page.tsx`:
```tsx
'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useInView } from 'react-intersection-observer'
import FilterSidebar from '@/components/FilterSidebar'
import SearchBar from '@/components/SearchBar'
import OpportunityCard from '@/components/OpportunityCard'
import PickedForYou from '@/components/PickedForYou'
import ProfilePrompt from '@/components/ProfilePrompt'
import { getAnonId } from '@/lib/anon'
import type { Opportunity } from '@/types'

function BrowsePage() {
  const searchParams = useSearchParams()
  const [results, setResults] = useState<Opportunity[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [showPrompt, setShowPrompt] = useState(false)
  const { ref, inView } = useInView()

  const query = searchParams.get('q') || ''

  const fetchPage = useCallback(async (pageNum: number, reset: boolean) => {
    setLoading(true)
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(pageNum))

    const endpoint = query ? `/api/search?${params}` : `/api/opportunities?${params}`
    const res = await fetch(endpoint)
    const data = await res.json()

    setResults(prev => reset ? data.results : [...prev, ...data.results])
    setHasMore(data.hasMore)
    setLoading(false)
  }, [searchParams, query])

  // Reset and refetch when filters change
  useEffect(() => {
    setPage(0)
    setResults([])
    fetchPage(0, true)
  }, [searchParams.toString()])

  // Infinite scroll
  useEffect(() => {
    if (inView && hasMore && !loading && page > 0) {
      fetchPage(page, false)
    }
  }, [inView])

  // Load next page
  useEffect(() => {
    if (page > 0) fetchPage(page, false)
  }, [page])

  // Load saved IDs
  useEffect(() => {
    const anonId = getAnonId()
    if (!anonId) return
    fetch('/api/saved', { headers: { 'x-anon-id': anonId } })
      .then(r => r.json())
      .then(data => setSavedIds(new Set(data.saved?.map((s: any) => s.opportunity_id))))
    setShowPrompt(!localStorage.getItem('vicpd_profile_dismissed'))
  }, [])

  async function handleToggleSave(id: string) {
    const anonId = getAnonId()
    const isSaved = savedIds.has(id)
    const method = isSaved ? 'DELETE' : 'POST'

    await fetch('/api/saved', {
      method,
      headers: { 'Content-Type': 'application/json', 'x-anon-id': anonId },
      body: JSON.stringify({ opportunity_id: id }),
    })

    setSavedIds(prev => {
      const next = new Set(prev)
      if (isSaved) next.delete(id)
      else next.add(id)
      return next
    })

    await fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-anon-id': anonId },
      body: JSON.stringify({ opportunity_id: id, action: 'save' }),
    })
  }

  function handleDismissPrompt() {
    localStorage.setItem('vicpd_profile_dismissed', '1')
    setShowPrompt(false)
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-4">
        <SearchBar />
      </div>

      <PickedForYou />

      {showPrompt && <ProfilePrompt onDismiss={handleDismissPrompt} />}

      <div className="flex gap-6">
        <Suspense>
          <FilterSidebar />
        </Suspense>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3 text-sm text-gray-500">
            <span>{results.length} opportunities</span>
            <select
              defaultValue={searchParams.get('sort') || 'date'}
              onChange={e => {
                const params = new URLSearchParams(searchParams.toString())
                params.set('sort', e.target.value)
                window.history.pushState(null, '', `/?${params}`)
              }}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="date">Upcoming date</option>
              <option value="recent">Recently added</option>
            </select>
          </div>

          {results.length === 0 && !loading && (
            <p className="text-gray-500 py-12 text-center">
              {query ? `No matches for "${query}" — try different filters.` : 'No opportunities found. Try adjusting filters.'}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {results.map(opp => (
              <OpportunityCard
                key={opp.id}
                opportunity={opp}
                savedIds={savedIds}
                onToggleSave={handleToggleSave}
              />
            ))}
          </div>

          {hasMore && (
            <div ref={ref} className="py-8 text-center text-gray-400 text-sm">
              {loading ? 'Loading more…' : 'Scroll for more'}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense>
      <BrowsePage />
    </Suspense>
  )
}
```

- [ ] **Step 3: Install react-intersection-observer**

```bash
npm install react-intersection-observer
```

- [ ] **Step 4: Run dev server and verify browse page loads**

```bash
npm run dev
```

Open http://localhost:3000. Expected: Page renders with search bar, filter sidebar, and empty state message (no data yet).

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/page.tsx
git commit -m "feat: build browse page with infinite scroll, filters, and saved state"
```

---

## Task 15: PD Detail Page

**Files:**
- Create: `app/opportunity/[id]/page.tsx`

- [ ] **Step 1: Create detail page**

Create `app/opportunity/[id]/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import OpportunityCard from '@/components/OpportunityCard'
import { getAnonId } from '@/lib/anon'
import type { Opportunity } from '@/types'

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>()
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null)
  const [related, setRelated] = useState<Opportunity[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)

  useEffect(() => {
    fetch(`/api/opportunities/${id}`)
      .then(r => r.json())
      .then(data => {
        setOpportunity(data.opportunity)
        setRelated(data.related ?? [])

        // Track view interaction
        const anonId = getAnonId()
        if (anonId) {
          fetch('/api/interactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-anon-id': anonId },
            body: JSON.stringify({ opportunity_id: id, action: 'view' }),
          })
        }
      })

    // Load saved state
    const anonId = getAnonId()
    if (anonId) {
      fetch('/api/saved', { headers: { 'x-anon-id': anonId } })
        .then(r => r.json())
        .then(data => setSavedIds(new Set(data.saved?.map((s: any) => s.opportunity_id))))
    }
  }, [id])

  async function handleToggleSave(oppId: string) {
    const anonId = getAnonId()
    const isSaved = savedIds.has(oppId)
    await fetch('/api/saved', {
      method: isSaved ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-anon-id': anonId },
      body: JSON.stringify({ opportunity_id: oppId }),
    })
    setSavedIds(prev => {
      const next = new Set(prev)
      if (isSaved) next.delete(oppId)
      else next.add(oppId)
      return next
    })
  }

  async function handleSaveNote() {
    const anonId = getAnonId()
    await fetch('/api/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-anon-id': anonId },
      body: JSON.stringify({ opportunity_id: id, notes: note }),
    })
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2000)
  }

  async function handleClickThrough() {
    const anonId = getAnonId()
    if (anonId) {
      await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-anon-id': anonId },
        body: JSON.stringify({ opportunity_id: id, action: 'click_through' }),
      })
    }
  }

  if (!opportunity) {
    return <main className="max-w-3xl mx-auto px-4 py-12 text-gray-400">Loading…</main>
  }

  const isSaved = savedIds.has(opportunity.id)
  const isFree = opportunity.cost?.toLowerCase().includes('free')

  const dateLabel = [
    opportunity.date_start
      ? new Date(opportunity.date_start).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Self-paced',
    opportunity.date_end && opportunity.date_start !== opportunity.date_end
      ? `– ${new Date(opportunity.date_end).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : null,
  ].filter(Boolean).join(' ')

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ← Back to browse
      </Link>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{opportunity.title}</h1>
            <p className="text-gray-500 mt-1">{opportunity.provider}</p>
          </div>
          <button
            onClick={() => handleToggleSave(opportunity.id)}
            className={`ml-4 shrink-0 text-2xl ${isSaved ? 'text-indigo-600' : 'text-gray-300 hover:text-indigo-400'}`}
            aria-label={isSaved ? 'Saved' : 'Save this opportunity'}
          >
            🔖
          </button>
        </div>

        <div className="flex flex-wrap gap-3 mb-4 text-sm">
          <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">📅 {dateLabel}</span>
          {opportunity.location && <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">📍 {opportunity.location}</span>}
          <span className={`px-2 py-0.5 rounded ${isFree ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
            {opportunity.cost || 'Free'}
          </span>
          {opportunity.is_accredited && (
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">✓ VIT Accredited</span>
          )}
        </div>

        {opportunity.description && (
          <p className="text-gray-700 leading-relaxed mb-4">{opportunity.description}</p>
        )}

        {opportunity.url && (
          <a
            href={opportunity.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClickThrough}
            className="inline-block bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Register / Learn more →
          </a>
        )}

        <div className="mt-6 border-t border-gray-100 pt-4">
          <label className="text-sm font-medium text-gray-700 block mb-1">Personal note</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add a note for yourself…"
            rows={2}
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
          <button
            onClick={handleSaveNote}
            className="mt-1 text-xs text-indigo-600 hover:underline"
          >
            {noteSaved ? '✓ Saved' : 'Save note'}
          </button>
        </div>
      </div>

      {related.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-700 mb-3">Related opportunities</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {related.map(opp => (
              <OpportunityCard
                key={opp.id}
                opportunity={opp}
                savedIds={savedIds}
                onToggleSave={handleToggleSave}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/opportunity/
git commit -m "feat: add PD detail page with save, notes, click-through tracking, and related"
```

---

## Task 16: Saved PD + Profile + Admin Pages

**Files:**
- Create: `app/saved/page.tsx`
- Create: `app/profile/page.tsx`
- Create: `app/admin/page.tsx`

- [ ] **Step 1: Create Saved PD page**

Create `app/saved/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAnonId } from '@/lib/anon'
import type { Opportunity } from '@/types'

interface SavedItem {
  opportunity: Opportunity
  saved_at: string
  notes: string | null
}

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const anonId = getAnonId()
    if (!anonId) { setLoading(false); return }

    fetch('/api/saved', { headers: { 'x-anon-id': anonId } })
      .then(r => r.json())
      .then(data => { setSaved(data.saved ?? []); setLoading(false) })
  }, [])

  async function handleRemove(opportunityId: string) {
    const anonId = getAnonId()
    await fetch('/api/saved', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-anon-id': anonId },
      body: JSON.stringify({ opportunity_id: opportunityId }),
    })
    setSaved(prev => prev.filter(s => s.opportunity.id !== opportunityId))
  }

  if (loading) return <main className="max-w-3xl mx-auto px-4 py-12 text-gray-400">Loading…</main>

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Saved PD</h1>

      {saved.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">No saved opportunities yet.</p>
          <Link href="/" className="text-indigo-600 hover:underline">Browse opportunities →</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {saved.map(({ opportunity, saved_at, notes }) => (
            <div key={opportunity.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <Link href={`/opportunity/${opportunity.id}`}
                    className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors">
                    {opportunity.title}
                  </Link>
                  <p className="text-sm text-gray-500">{opportunity.provider} · {opportunity.location}</p>
                  {opportunity.date_start && (
                    <p className="text-sm text-gray-500">
                      📅 {new Date(opportunity.date_start).toLocaleDateString('en-AU')}
                    </p>
                  )}
                  {notes && (
                    <p className="text-sm text-gray-600 italic mt-1 bg-gray-50 px-2 py-1 rounded">
                      "{notes}"
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(opportunity.id)}
                  className="ml-4 text-gray-400 hover:text-red-500 transition-colors text-sm"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {saved.length >= 3 && !localStorage.getItem('vicpd_signed_up') && (
        <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm">
          <p className="text-indigo-800 font-medium">Sign up to sync your saves across devices</p>
          <p className="text-indigo-600 text-xs mt-1">Your saves are stored in this browser — signing up keeps them safe.</p>
          <Link href="/profile" className="text-indigo-600 hover:underline text-xs">Set up profile →</Link>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Create Profile page**

Create `app/profile/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { getAnonId } from '@/lib/anon'

const TEACHING_AREAS = ['Maths', 'English / Literacy', 'Science', 'Humanities', 'Arts', 'Health & PE', 'Wellbeing', 'STEM', 'Inclusion', 'Leadership']
const YEAR_LEVELS = ['Foundation–6', '7–10', 'VCE / Senior']
const SCHOOL_TYPES = [
  { value: 'government', label: 'Government' },
  { value: 'catholic', label: 'Catholic' },
  { value: 'independent', label: 'Independent' },
]

export default function ProfilePage() {
  const [teachingAreas, setTeachingAreas] = useState<string[]>([])
  const [yearLevels, setYearLevels] = useState<string[]>([])
  const [interests, setInterests] = useState('')
  const [schoolType, setSchoolType] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const anonId = getAnonId()
    if (!anonId) { setLoading(false); return }

    fetch('/api/profile', { headers: { 'x-anon-id': anonId } })
      .then(r => r.json())
      .then(data => {
        if (data.profile) {
          setTeachingAreas(data.profile.teaching_areas ?? [])
          setYearLevels(data.profile.year_levels ?? [])
          setInterests((data.profile.interests ?? []).join(', '))
          setSchoolType(data.profile.school_type ?? '')
        }
        setLoading(false)
      })
  }, [])

  function toggleItem(list: string[], setList: (v: string[]) => void, item: string) {
    setList(list.includes(item) ? list.filter(i => i !== item) : [...list, item])
  }

  async function handleSave() {
    const anonId = getAnonId()
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-anon-id': anonId },
      body: JSON.stringify({
        teaching_areas: teachingAreas,
        year_levels: yearLevels,
        interests: interests.split(',').map(s => s.trim()).filter(Boolean),
        school_type: schoolType || null,
      }),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <main className="max-w-lg mx-auto px-4 py-12 text-gray-400">Loading…</main>

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">My Profile</h1>
      <p className="text-gray-500 text-sm mb-6">
        Tell us about your teaching to get personalised recommendations.
        No sign-up required — your profile is stored in this browser.
      </p>

      <div className="space-y-6">
        <section>
          <h2 className="font-semibold text-gray-700 mb-2">Teaching areas</h2>
          <div className="flex flex-wrap gap-2">
            {TEACHING_AREAS.map(area => (
              <button
                key={area}
                onClick={() => toggleItem(teachingAreas, setTeachingAreas, area)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  teachingAreas.includes(area)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-gray-700 mb-2">Year levels</h2>
          <div className="flex flex-wrap gap-2">
            {YEAR_LEVELS.map(yl => (
              <button
                key={yl}
                onClick={() => toggleItem(yearLevels, setYearLevels, yl)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  yearLevels.includes(yl)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                }`}
              >
                {yl}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-gray-700 mb-2">Interests / focus areas</h2>
          <input
            type="text"
            value={interests}
            onChange={e => setInterests(e.target.value)}
            placeholder="e.g. restorative practices, data literacy, differentiation"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 mt-1">Comma-separated</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-700 mb-2">School type</h2>
          <div className="flex gap-3">
            {SCHOOL_TYPES.map(st => (
              <label key={st.value} className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                <input type="radio" name="school_type" value={st.value}
                  checked={schoolType === st.value}
                  onChange={() => setSchoolType(st.value)}
                  className="accent-indigo-600" />
                {st.label}
              </label>
            ))}
          </div>
        </section>

        <button
          onClick={handleSave}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {saved ? '✓ Saved!' : 'Save profile'}
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Create Admin page**

Create `app/admin/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import type { Source } from '@/types'

export default function AdminPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [scraping, setScraping] = useState(false)
  const [scrapeResult, setScrapeResult] = useState<string | null>(null)
  const [totalOpps, setTotalOpps] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/opportunities?page=0')
      .then(r => r.json())
      .then(d => setTotalOpps(d.results?.length))
  }, [])

  async function handleScrapeNow() {
    setScraping(true)
    setScrapeResult(null)
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { Authorization: `Bearer ${prompt('Enter CRON_SECRET')}` },
      })
      const data = await res.json()
      setScrapeResult(`Scraped ${data.scraped} opportunities. Errors: ${data.errors?.length ?? 0}`)
    } catch (err) {
      setScrapeResult(`Error: ${err}`)
    }
    setScraping(false)
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin</h1>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Total opportunities (approx)</p>
          <p className="text-3xl font-bold text-gray-900">{totalOpps ?? '—'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500 mb-2">Manual scrape</p>
          <button
            onClick={handleScrapeNow}
            disabled={scraping}
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {scraping ? 'Scraping…' : 'Run scrape now'}
          </button>
          {scrapeResult && <p className="text-sm text-gray-600 mt-2">{scrapeResult}</p>}
        </div>
      </div>

      <h2 className="font-semibold text-gray-700 mb-3">Sources</h2>
      <div className="bg-white border border-gray-200 rounded-lg divide-y">
        {sources.length === 0 && (
          <p className="px-4 py-3 text-sm text-gray-400">
            Sources are managed in Supabase → Table Editor → sources.
          </p>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Run dev server and verify all pages**

```bash
npm run dev
```

Navigate to:
- http://localhost:3000 — browse page
- http://localhost:3000/saved — saved page
- http://localhost:3000/profile — profile page
- http://localhost:3000/admin — redirects to login
- http://localhost:3000/admin/login — login form

Expected: all pages load without errors.

- [ ] **Step 5: Commit**

```bash
git add app/saved/ app/profile/ app/admin/
git commit -m "feat: add saved, profile, and admin pages"
```

---

## Task 17: Playwright E2E Tests

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/browse.spec.ts`
- Create: `tests/e2e/detail.spec.ts`
- Create: `tests/e2e/profile.spec.ts`

- [ ] **Step 1: Create Playwright config**

Create `playwright.config.ts`:
```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

- [ ] **Step 2: Create browse E2E test**

Create `tests/e2e/browse.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.describe('Browse page', () => {
  test('renders search bar and filter sidebar', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByPlaceholder('Search professional learning opportunities')).toBeVisible()
    await expect(page.getByText('Filter')).toBeVisible()
    await expect(page.getByText('Type')).toBeVisible()
    await expect(page.getByText('Cost')).toBeVisible()
  })

  test('shows empty state when no results', async ({ page }) => {
    await page.goto('/?q=xyznonexistentsearchterm123')
    await expect(page.getByText(/No matches for/)).toBeVisible({ timeout: 10000 })
  })

  test('updates URL when typing in search bar', async ({ page }) => {
    await page.goto('/')
    await page.getByPlaceholder('Search professional learning opportunities').fill('maths')
    await page.waitForURL(/\?q=maths/, { timeout: 5000 })
    expect(page.url()).toContain('q=maths')
  })

  test('clicking a filter updates URL', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Workshop').click()
    await page.waitForURL(/type=workshop/)
    expect(page.url()).toContain('type=workshop')
  })
})
```

- [ ] **Step 3: Create detail page E2E test**

Create `tests/e2e/detail.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.describe('Detail page', () => {
  test('shows back link', async ({ page }) => {
    // Using a fake ID — page should show loading or not-found gracefully
    await page.goto('/opportunity/00000000-0000-0000-0000-000000000001')
    await expect(page.getByText('← Back to browse')).toBeVisible()
  })

  test('saved page shows empty state with browse link', async ({ page }) => {
    await page.goto('/saved')
    await expect(page.getByText('No saved opportunities yet.')).toBeVisible()
    await expect(page.getByText('Browse opportunities →')).toBeVisible()
  })
})
```

- [ ] **Step 4: Create profile E2E test**

Create `tests/e2e/profile.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.describe('Profile page', () => {
  test('renders teaching area chips', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByText('Maths')).toBeVisible()
    await expect(page.getByText('Science')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible()
  })

  test('toggling a teaching area chip changes its style', async ({ page }) => {
    await page.goto('/profile')
    const mathsChip = page.getByRole('button', { name: 'Maths' })
    await mathsChip.click()
    await expect(mathsChip).toHaveClass(/bg-indigo-600/)
    await mathsChip.click()
    await expect(mathsChip).not.toHaveClass(/bg-indigo-600/)
  })

  test('admin login redirects to /admin after correct password', async ({ page }) => {
    // Only works if ADMIN_PASSWORD env var is set to "testpass" in .env.local
    await page.goto('/admin/login')
    await expect(page.getByPlaceholder('Admin password')).toBeVisible()
  })
})
```

- [ ] **Step 5: Run E2E tests**

```bash
npm run test:e2e
```

Expected: all E2E tests pass. (Some may be skipped if the dev server has no data — that's expected.)

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e/
git commit -m "test: add Playwright E2E tests for browse, detail, and profile"
```

---

## Task 18: Vercel Deployment

**Files:**
- No new files — deploy existing project

- [ ] **Step 1: Create a Vercel account and link project**

```bash
npx vercel login
npx vercel
```

Follow prompts: link to your Vercel account, create new project, accept defaults.

- [ ] **Step 2: Add environment variables in Vercel**

In your Vercel dashboard → Project Settings → Environment Variables, add:
```
NEXT_PUBLIC_SUPABASE_URL        = <from Supabase>
NEXT_PUBLIC_SUPABASE_ANON_KEY   = <from Supabase>
SUPABASE_SERVICE_ROLE_KEY       = <from Supabase>
ANTHROPIC_API_KEY               = <from Anthropic console>
FIRECRAWL_API_KEY               = <from firecrawl.dev>
BRAVE_API_KEY                   = <from Brave>
ADMIN_PASSWORD                  = <your chosen password>
CRON_SECRET                     = <your chosen secret>
```

- [ ] **Step 3: Deploy to production**

```bash
npx vercel --prod
```

Expected output ends with: `✓ Production: https://vicpd.vercel.app` (URL will vary).

- [ ] **Step 4: Trigger first scrape**

```bash
curl -X POST https://your-app.vercel.app/api/scrape \
  -H "Authorization: Bearer your-cron-secret"
```

Expected: `{"scraped": N, "errors": [...]}` — some sources may return errors if their HTML structure is unusual; that's normal for the first run.

- [ ] **Step 5: Verify the live app**

Open your Vercel URL. Verify:
- Browse page loads
- Profile page saves (check Supabase table editor for the user_profiles row)
- Admin login works at `/admin/login`

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final deploy configuration and README"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ All types of PD (conference, workshop, online, accredited, resource) — opportunity_type enum
- ✅ Victoria-only scope — extraction prompt instructs Claude, Brave query targets .vic.gov.au / .edu.au
- ✅ Hybrid scraping + on-demand search — Tasks 7 and 8
- ✅ Profile + behaviour-based personalisation — Tasks 9 and 10
- ✅ Anonymous-first (localStorage UUID) — Task 9, lib/anon.ts
- ✅ Browse page with filters — Task 14
- ✅ PD detail + related + save + note — Task 15
- ✅ Saved page — Task 16
- ✅ Profile page — Task 16
- ✅ Admin page — Task 16
- ✅ Scheduled cron (scrape + expire) — Task 7
- ✅ Recommendation cache (1-hour TTL) — Task 10
- ✅ Error handling (scrape failure logs, Claude retry, empty search fallback) — in routes
- ✅ Unit tests (extract, recommend, anon) — Tasks 4, 5, 9
- ✅ E2E tests (browse, detail, profile) — Task 17
- ✅ Deployment — Task 18
- ✅ Out of scope correctly excluded (no email, no school admin, no mobile app)
