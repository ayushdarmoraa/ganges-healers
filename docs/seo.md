SEO polish

- canonicalOf(path, stripParams?) helper in src/config/site.ts
- JSON-LD server components:
  - ServiceLd: Service entity
  - ProgramLd: Course entity
  - HealerLd: Person entity
  - BreadcrumbsLd: BreadcrumbList
- Metadata:
  - List pages (/services, /programs, /healers, /store): title, description, canonical via generateMetadata
  - Detail pages: generateMetadata includes canonical; Services canonical strips openBooking and programSlug.

Sitemap

- Helper: src/lib/seo/sitemap.ts builds absolute canonical URLs using canonicalOf.
- Included pages: /, /about (static roots), lists (/services, /programs, /healers), and detail pages for each Service, Program, and Healer.
- Canonical-only policy: no query params (e.g., openBooking, programSlug) are ever emitted.
- lastModified fallback: updatedAt if present, otherwise current date.
- Cadence: weekly for Services/Healers, monthly for Programs; lists are weekly; detail priorities set to 0.8, lists to 0.6.

Robots
Breadcrumbs

- Helpers: `src/lib/seo/breadcrumbs.ts` expose typed crumb builders for Services/Programs/Healers/Store, including index variants (Home › Section) for list pages.
- UI: `src/components/seo/Breadcrumbs.tsx` renders a simple nav with Home › … separators; last crumb is not linked.
- JSON-LD: `src/components/seo/BreadcrumbsLd.tsx` emits a `BreadcrumbList` with absolute URLs using `canonicalOf`.
- Wired on detail and list pages (Home › Section on list pages).

404s & Metadata

- For not found states, pages still resolve canonical metadata (title/alternates). No JSON-LD is emitted for missing entities.


- Served via app/robots.ts.
- Disallows private surfaces: /api/, /admin/, /dashboard/, and auth paths.
- Points to the canonical sitemap at /sitemap.xml.
