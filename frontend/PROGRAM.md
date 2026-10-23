# Frontend program contract

## Modules and lifecycle

- `src/main.ts` imports global styles and starts one application instance.
- `src/program.ts` owns persisted workspace state, API requests, validation, automation, route selection, and the application event lifecycle. It keeps the existing delegated `data-*` action contracts so the current workflows remain stable.
- `src/components.ts` owns safe assistant Markdown rendering and HTML escaping used by all three assistant surfaces.
- `src/types.ts` defines the persisted workspace and assistant API contracts. `src/app.css` owns the interface styles.
- `index.html` is the Vite development entry. The root `index.html` loads the deterministic Vite build at `/frontend/dist/assets/` so the existing Node server continues to serve the application and API on port `8877`.

## State and persistence

- Workspace state remains in browser `localStorage` under `prumo-licitacoes-v1`; document blobs and complete page text remain in IndexedDB. The server configuration, downloaded notices, and portal sessions remain server-owned.
- The program loads `/api/app-config`, `/api/health`, automation status, and existing service endpoints. Credentials and service endpoints stay in the server configuration.
- Assistant histories, CAT records, professional profiles, proposals, clients, items, and capture settings preserve their existing local persistence behavior.

## Behavior and boundaries

- Assistant calls use `/api/assistant/chat`; public notice collection, OpenJev, Metis, OCR, and memory continue through the existing Node service. No API or persistence ownership moves to the browser build.
- CAT intake extracts selectable text and OCRs image pages sequentially, releasing each page canvas before reading the next. After page extraction, it sends the complete text once to `/api/ocr/cat-professionals`; the NVIDIA response identifies the CAT's professional holder and attributes the acervo's properties and activities to that person across pages. Additional professionals are included only when a CAT/ART explicitly assigns them separate responsibility. Results include evidence and page references. CAT records persist those assignments and analysis version/hash. Professional profiles store linked CAT experience and extracted facts, and the assistant receives those attributed facts in its workspace context.
- The full-document responsible analysis accepts up to 400,000 characters. Oversized or failed analyses remain visibly pending; the source PDF and extracted page text stay available for a later reprocess. The explicit “Reextrair dados-chave das CATs” action runs the same analysis once per changed CAT text and reuses an unchanged completed analysis.
- Assistant Markdown supports headings, paragraphs, emphasis, links restricted to HTTP(S), lists, block quotes, tables, and code blocks. Raw HTML is escaped.
- Existing named DOM controls and delegated `data-action` / `data-page` interactions remain the UI command surface. Do not add a second global state store or duplicate service ownership in view helpers.
- The Vite development server proxies `/api`, `/vendor`, and `/data` to the existing server at `127.0.0.1:8877`.

## Verification and known limits

- `npm run build:frontend` type-checks the TypeScript frontend and creates the static bundle consumed by the existing server.
- Real external portal, model, OCR, and memory calls still depend on their configured local services and credentials. The real NVIDIA CAT-professional analysis path still needs an attached PDF and configured NVIDIA service for end-to-end verification.
