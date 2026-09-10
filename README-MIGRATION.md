# Astro Migration — Notes

> Historical notes from the earlier Vite/React-to-Astro migration. File names, content, and completion claims below describe that stage and may no longer match the repository. Phase 0 is now complete, and Phase 0.5 has local architecture evidence with remote staging verification still pending. For current CMS work, use the [implementation plan](docs/plan.md), [specification](docs/cms-migration-plan.md), and [architecture record](docs/cms/architecture-spike.md).

Scaffolded from the original Vite+React repo (`Watcharapol-Frong/portfolio`), same look & feel, now with SSG.

## Setup
```
npm install
npm run dev -- --background # Start the development server in background mode
npm run build     # outputs to dist/
```

## What transferred 1:1
- Design tokens: colors, radius, fonts, custom animations — see `src/styles/global.css`
  (ported to Tailwind v4's `@theme` syntax, since that's what `astro add tailwind` installs by default now — the original used Tailwind v3's JS config)
- shadcn/ui `popover` primitive — copied verbatim
- `ScrollRevealText` — copied verbatim, no changes
- All project data/copy — copied verbatim

## What had to change (and why)
- **Navbar.tsx / FloatingNav.tsx**: originally used `useLocation()` / `<Link>` from
  `react-router-dom`, which only work inside a `<BrowserRouter>`. Astro has no global
  client router, so these were swapped for `window.location.pathname` + plain `<a>` tags.
  Same behavior, no router dependency.
- **Routing**: file-based now (`src/pages/`) instead of the `<Routes>` block in `App.tsx`.
  `/project/:id` → `src/pages/project/[id].astro` with `getStaticPaths()`, generates
  all 18 project pages at build time.
- **Islands**: `ProjectIndex` (home) and `About` are shipped as single React islands
  (`HomeIsland.tsx`, `AboutIsland.tsx`) since their internal state (category filter,
  scroll listeners) needs to stay together, same as the original. The `Project` detail
  page is plain static HTML — only `Navbar`/`FloatingNav` hydrate as small islands.
  This is the actual payoff of the migration: the heaviest page (project detail, has the
  image gallery) ships the least JS.
- **lucide-react pinned to 0.462.0** — newer versions dropped brand icons
  (Instagram/LinkedIn/Dribbble) that FloatingNav/About use.

## Deliberately NOT carried over (needs your input)
- **Local images** (`src/assets/*.jpg`, ~12MB): swapped for Unsplash placeholder URLs
  in `src/data/projects.ts` since the whole project list is placeholder content anyway
  (see below).
- **Supabase**: wired in the original `src/integrations/supabase/` but has zero tables —
  unused scaffold. Not carried over; add back when there's an actual use for it.
- **Content collections for blog**: not built yet — this scaffold only covers the
  Phase-1 migration (existing 4 pages). Blog/MDX content collection is the next step
  once this is in place.

## Important: the content is still placeholder
This repo's current content is a Lovable demo template ("Jordan Studio — Graphic
Designer", Portuguese meta tags, fake clients like Vogue Brasil/Nike/Spotify). None
of it is real. `src/data/projects.ts`, `src/layouts/Layout.astro` (site title/meta),
and `AboutIsland.tsx` (bio, clients, services) all still need your real content —
migrating the framework didn't touch that.
