# hh-suppliers Architecture

**Repo:** portiahart/hh-suppliers
**Supabase project:** hh-main (`dqfrqjsbfmwtclkclmvc`)
**Deployed:** prov.portiahart.com
**Last updated:** 2026-05-10

---

## Overview

Supplier database management app for Hart Hospitality. Staff can search, create, and manage supplier records; view payables dashboards; run Colombian tax retention (retenciones) calculations from parsed RUT documents; and produce BIC (B Corp Impact Colombia) reports. All data lives in hh-main Supabase — `accounts_suppliers` is shared with hh-accounts.

**Commands:**
```
npm run dev      # localhost:5173
npm run build    # tsc -b && vite build
npm run lint
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite 8, React 19, TypeScript ~5.9 |
| Routing | react-router-dom v7 |
| UI | Custom inline styles + Radix UI icons. No shadcn/ui, no TanStack Query |
| Database | Supabase (hh-main) via @supabase/supabase-js v2 + @supabase/ssr |
| Deployment | Vercel |

No component library — all styles are inline React CSSProperties. No TanStack Query — all data fetching is direct Supabase calls inside useEffect / useCallback.

---

## Authentication

**System:** Supabase Auth (crm_users). Session cookie domain `.portiahart.com` — shared across all HH apps so a CRM login at another app carries over here.

**Implementation:** `src/context/AuthContext.tsx`

- Uses `supabase.auth.onAuthStateChange`. The callback handles only `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`.
- **Critical:** the callback never awaits any Supabase operation. If it did, it would deadlock during `_initialize()` (see comment in source). Only React state setters are called inside the callback.
- Exposes `{ session, loading }` — no user profile, no crm_users row. Components that need `is_super_admin` query `crm_users` themselves after checking `session.user.id`.

**Supabase client:** `src/lib/supabase.ts`

- `createBrowserClient` with cookie domain `.portiahart.com`
- **Auth timeout wrapper:** all `/auth/v1/` fetch requests time out after 5 seconds, returning a synthetic 500 response. Non-auth requests are unaffected.
- **Initialization watchdog:** if `INITIAL_SESSION` never fires within 10 seconds, all `sb-*` cookies are cleared (both domain-scoped and root-path) and the page reloads to prevent an infinite loading state.
- **`suppliersQuery(select?)`** helper: pre-filtered query builder for `accounts_suppliers` that always excludes `razon_social ILIKE 'X -%'` (internal entries) and `archived_at IS NULL` (archived suppliers). Use this instead of `supabase.from('accounts_suppliers').select(...)` whenever querying the normal supplier list.

---

## Routing

All protected routes are wrapped in `ProtectedRoute` → `AppLayout` (sidebar shell). Unauthenticated users are redirected to `/login`.

| Path | Page | Auth |
|------|------|------|
| `/login` | LoginPage | Public |
| `/` | SearchPage | Protected |
| `/suppliers/:id` | SupplierProfile | Protected |
| `/new` | NewSupplierFlow | Protected |
| `/settings` | SettingsPage | Protected |
| `/reportes-bic` | ReportesBICPage | Protected |

---

## Pages (`src/pages/`)

### SearchPage (`/`)

Main dashboard. Three sections:

**Hero search** — typeahead input with 250ms debounce. Searches `accounts_suppliers` via `suppliersQuery` with `OR(razon_social.ilike, nombre_operativo.ilike, nit.ilike)`, limit 8. Results shown in dropdown; click navigates to `/suppliers/:id`.

**Action cards** — three summary cards fed from `cuentas_por_pagar_cache`:
- *Facturas Aprobadas* — `aprobado = 'SI'`
- *Facturas Pendiente Aprobación* — `aprobado != 'SI'` AND `fecha_vencimiento <= end of current month`
- *Cartera Vencida* — `fecha_vencimiento < today`

Each card shows count + total COP. A **company filter** (derived from CPP data) narrows all three cards. Clicking amounts opens a drill-down `InvoiceModal`.

**Top 20 suppliers by spend (last 60 days)** — fetches all rows from `transactions_cache` with `fecha_factura >= today - 60`. Groups by NIT, sums `importe_cop` (respects `empresa_split` jsonb for shared-entity allocations), shows top 20. Loads `suppliers_assessment.pass` badges for each row.

**Super admin extras** (only when `crm_users.is_super_admin = true`):
- Duplicate detection: full scan of `accounts_suppliers`, groups by normalized `razon_social`, shows count badge → `DuplicatesModal`
- No-NIT detection: suppliers with `nit IS NULL`, shows count badge → `NoNitModal`

### SupplierProfile (`/suppliers/:id`)

Six-tab layout:

| Tab | Content |
|-----|---------|
| General | razon_social, nombre_operativo, NIT, documento_tipo, tipo_persona, email, telefono, categoria, status, archive action |
| Bancario | Bank account details from `suppliers_banking`; upload Certificado Bancario PDF/image → `extract-banking` edge function (Claude) auto-fills fields |
| Evaluación | Happy Supplier Test from `suppliers_assessment`; answers jsonb, total_score, pass/fail, assessed_by |
| B Corp | BIC survey fields (bic_survey_score, bic_ubicacion, etc.) from `accounts_suppliers`; also shows parsed retenciones recommendations from RUT data |
| Gasto | Spend history from `transactions_cache` filtered by NIT; month-by-month breakdown |
| Contactos CRM | Links to this supplier's contacts in the CRM (hh-crm-app) by NIT |

Sections on the General tab (in order):
1. **Identidad y Legal** — editable supplier + legal fields
2. **Especificidad de Pago** — single `pago_inmediato` checkbox (Inmediato), saves immediately on toggle
3. **Información Tributaria** — CIIU / responsabilidades from RUT
4. **Retenciones** — computed tax retention table
5. **Documentos** — uploaded files
6. **Acceso del proveedor** — magic link sender

Also shows:
- Documents from `suppliers_documents` (uploaded RUT, Cámara de Comercio, etc.)
- Retenciones panel: if RUT data is available in `suppliers_legal`, runs `computeRetenciones(rut)` and renders a table of Retefuente / ReteICA / ReteIVA recommendations
- Archive button (super admin only): sets `archived_at`, hides from `suppliersQuery`

### NewSupplierFlow (`/new`)

Multi-step new supplier creation:

1. Optional RUT upload:
   - Uploads file to `supplier-documents` bucket under `_temp/` path
   - Calls `extract-rut` edge function (Claude) via `supabase.functions.invoke`
   - Auto-fills razon_social, NIT, email, telefono from extracted data
2. Duplicate / similar name check:
   - Exact NIT match → warns "already exists", link to existing profile
   - Token similarity match (normalized names, token overlap ratio) → shows similar candidates
3. Form fields: razon_social, NIT, nombre_operativo, email, telefono
4. On save: inserts into `accounts_suppliers` → DB webhook fires `sync-supplier-to-sheets`; temp RUT file moved to permanent path

### SettingsPage (`/settings`)

Minimal — displays the logged-in user's email from `session.user.email`.

### ReportesBICPage (`/reportes-bic`)

BIC (Business Impact Colombia / B Corp) reporting across legal entities. Fetches all rows from `suppliers_spend_monthly` and groups by year and legal entity group:

| Group | Entities |
|-------|---------|
| BPM | BA |
| BMP | TH |
| GA | GA |
| Manzana Azul | PM, MA, HH, AB, AW, CR |

Shows per-year: active supplier count, top spenders by total COP. Useful for B Corp impact certification.

---

## Components (`src/components/`)

| File | Purpose |
|------|---------|
| `AppLayout.tsx` | Outer page shell wrapping sidebar + main content area |
| `Sidebar.tsx` | Left navigation: Proveedores (/), Nuevo (/new), Reportes BIC (/reportes-bic), Settings (/settings) |
| `ProtectedRoute.tsx` | Redirects unauthenticated users to `/login`; passes children if session exists |
| `DuplicatesModal.tsx` | Super-admin modal listing duplicate supplier groups (same normalized razon_social). Merge action: keeps survivor, archives absorbed record, reparents documents. |
| `NoNitModal.tsx` | Super-admin modal listing all suppliers without a NIT, sorted alphabetically |
| `PendingApprovalsModal.tsx` | Shows CPP rows pending approval (aprobado ≠ 'SI'); inline approve action writes back to `cuentas_por_pagar_cache`. Parses Google Sheets date serials and mixed number formats. |

---

## Key Lib Files (`src/lib/`)

### `supabase.ts`

- `supabase` — shared browser client (see Auth section above for timeout/watchdog details)
- `suppliersQuery(select?)` — pre-filtered query for `accounts_suppliers`; always excludes internal entries and archived suppliers

### `retencionesEngine.ts`

`computeRetenciones(rut: RUTData): RetencionRecomendada[]`

Computes Colombian tax retenciones based on parsed RUT data. Returns three `RetencionRecomendada` objects (one per type):

**Retefuente** — maps CIIU activity codes to concepts via `getCIIUConcept()`:

| CIIU range | Concept | Rates |
|-----------|---------|-------|
| 01–03, 10–33, 45–47, 56 | Compras | 2.5% (declarante) / 3.5% (no declarante) |
| 41–43 | Contratos de construcción | 2% |
| 49–53 | Transporte de carga | 1% |
| 55 | Servicios (alojamiento) | 4% / 6% |
| 68 | Arrendamiento | 4% |
| 69–75 | Honorarios | 10% (natural) / 11% (jurídica) |
| All others | Servicios generales | 4% / 6% |

Special rules: RST (responsabilidad 47) → no retención; autorretenedor (código 15 in responsabilidades) → no retener; multiple CIIU concepts → warns to review by purchase type.

**ReteICA (Cartagena 2026)** — rates confirmed by accountant:
- Services: 0.856%
- Commercial/industrial/construction/transport: 0.749%
- Agropecuario (CIIU 01–03): exempt
- Non-Cartagena suppliers: not applicable
- Base mínima: $437,726 (25% SMLMV 2026)

**ReteIVA** — Art. 437-2 ET (HH is NOT gran contribuyente):
- Persona jurídica → never applies
- Not responsable IVA (no code 48) → never applies
- Compras / transport → activity excluded from IVA
- Persona natural no declarante + responsable IVA + non-excluded activity → 15% of IVA facturado

**2026 constants:** UVT = $52,374; BASE_10_UVT = $523,740 (compras, construcción); BASE_2_UVT = $104,748 (servicios, transporte).

To update annual rates: change `UVT_2026`, `ICA_SERVICIOS`, `ICA_PRODUCTOS`, `BASE_ICA` constants at the top of the file.

### `rutParser.ts`

`parseRUT(fileUrl: string): Promise<RUTData>`

Downloads a RUT PDF or image from a Supabase Storage signed URL, encodes it as base64, and sends it directly to the Anthropic API (`claude-sonnet-4-20250514`) as a document or image content block.

The system prompt instructs the model to parse DIAN Formulario 001 fields precisely, with explicit rules for:
- Reading all four CIIU activity code slots (fields 46, 48, 50×2) independently
- Reading the responsabilidades grid (field 53) — each filled box contains a 1–2 digit code
- Reassembling spaced NIT digits
- Deriving autorretenedor/regimen_simple/declarante_renta/responsable_iva booleans only from responsabilidades codes (not from field labels)

Returns structured `RUTData`. Note: this calls the Anthropic API directly from the browser using `fetch` — the API key must be available in the client context (currently hardcoded in the function, or passed as env var).

### `rutLookups.ts`

Static lookup maps:
- `RESPONSABILIDADES_LABELS` — human labels for DIAN responsibility codes (05–55)
- `CIIU_LABELS` — ~100 most common CIIU codes relevant to HH suppliers, with descriptions

### `rutTypes.ts`

TypeScript interfaces:
- `RUTData` — full parsed RUT (nit, razon_social, tipo_persona, ciudad, responsabilidades[], actividad_principal, actividad_secundaria, otras_actividades[], establecimientos[], derived booleans)
- `RetencionRecomendada` — single retention recommendation (retencion_tipo, concepto, tarifa_recomendada, base_minima, aplica, notas)
- `RUTActividad`, `RUTEstablecimiento` — nested interfaces

### `types/supplier.ts`

`Supplier` interface and `SupplierStatus = 'ACTIVE' | 'INACTIVE'`. Mirrors the `accounts_suppliers` columns including all BIC fields.

---

## Supabase Database Schema

All tables on hh-main (`dqfrqjsbfmwtclkclmvc`). All protected by RLS; authenticated staff have full read/write.

### `accounts_suppliers` (shared with hh-accounts)

Primary supplier record. Used by both this app and hh-accounts (for CDC document creation and accounting views).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| razon_social | text | Legal name. Rows with `ILIKE 'X -%'` are internal entries — always excluded by `suppliersQuery` |
| nombre_operativo | text | Operating/trading name |
| nit | text | Colombian tax ID (without DV) |
| documento_tipo | text | |
| tipo_persona | text | 'JURIDICA' / 'NATURAL' |
| email | text | |
| telefono | text | |
| categoria | text | |
| status | text | 'ACTIVE' / 'INACTIVE' |
| archived_at | timestamptz | Null = active; set to archive. Excluded by `suppliersQuery` |
| is_iva_responsible | boolean | Added by hh-accounts for CDC IVA calculation |
| bic_survey_score | text | BIC/B Corp survey score |
| bic_ubicacion | text | BIC ubicación score |
| bic_categoria | text | BIC category |
| bic_physical_goods | text | BIC physical goods flag |
| bic_independent | text | BIC independent flag |
| bic_underserved | text | BIC underserved flag |
| bic_small_company | text | BIC small company flag |
| bic_minoria | text | BIC minority-owned flag |
| bic_synced_at | timestamptz | Last BIC sync from DATABASEOLD sheet cols AN–AU |
| pago_inmediato | boolean | Supplier is paid immediately (vs. via transfer/PSE). Seeded once from DATABASEOLD col N; managed in-app thereafter. |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Database webhook:** Every INSERT/UPDATE fires `sync-supplier-to-sheets` edge function → mirrors row to "supabase-masterlist" tab in Google Sheet `1AFhvJXBJsfwbCVxyirJAJDIlRQDncPywfknkYl1h6O4`.

### `suppliers_assessment`

Happy Supplier Test results. One-to-one with `accounts_suppliers`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| supplier_id | uuid UNIQUE FK | → accounts_suppliers(id) ON DELETE CASCADE |
| answers | jsonb | Question answers keyed by question id |
| total_score | integer | Computed from answers |
| pass | boolean | Whether supplier passed the assessment |
| assessed_at | timestamptz | |
| assessed_by | text | Email of assessor |
| created_at / updated_at | timestamptz | |

### `suppliers_documents`

Uploaded compliance documents per supplier.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| supplier_id | uuid FK | → accounts_suppliers(id) ON DELETE CASCADE |
| document_type | text | 'RUT', 'Cámara de Comercio', etc. |
| storage_path | text | Path within `supplier-documents` bucket |
| file_name | text | Original file name |
| file_size_bytes | bigint | |
| mime_type | text | |
| uploaded_by | text | Uploader email |
| created_at / updated_at | timestamptz | |

**Storage bucket:** `supplier-documents` — private, 10MB limit, allows PDF/JPEG/PNG/WEBP.

### `suppliers_banking`

Bank account details per supplier. Populated via `extract-banking` AI function.

| Column | Type | Notes |
|--------|------|-------|
| nombre_beneficiario | text | Account holder name |
| banco | text | Bank name |
| tipo_cuenta | text | 'Ahorros' / 'Corriente' |
| numero_cuenta | text | Account number |
| tipo_documento_bancolombia | text | 'NIT' / 'CC' / 'CE' |
| verificacion_notas | text | Manual verification notes |
| verificado_at | timestamptz | |
| verificado_por | text | |
| updated_at | timestamptz | |

### `suppliers_legal`

Legal / tax identity data from parsed RUT. Populated by RUT extraction flow.

| Column | Type | Notes |
|--------|------|-------|
| codigo_tributario | text | Tax responsibility codes |
| ciiu | text | Primary CIIU activity code |
| direccion | text | Registered address |
| ciudad | text | City (used by retenciones engine to determine Cartagena ICA applicability) |
| pais | text | |
| proximity_zone | text | |
| rep_legal_nombre | text | Legal representative name |
| rep_legal_documento | text | Legal representative document number |
| updated_at | timestamptz | |

### `transactions_cache`

Cache of expense transactions from Google Sheets ranges. Full DELETE + INSERT on each sync (not upsert). Synced by `sync-transactions-cache` edge function from BANCOS, CASHAPP, TARSCOL, EXTRA named ranges.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Generated on each sync cycle |
| source | text | 'BANCOS' / 'CASHAPP' / 'TARSCOL' / 'EXTRA' |
| fecha_operacion | date | |
| fecha_factura | date | |
| fecha_vencimiento | date | |
| proveedor | text | Supplier name (free text, not FK) |
| nit | text | Supplier NIT |
| importe_cop | numeric(15,2) | |
| monto_base / total_iva / total_ipc | numeric(15,2) | |
| rete_fuente / rete_ica | numeric(15,2) | |
| concepto / tipo_egreso / centro_costo / tipo_documento | text | |
| empresa_raw | text | Raw empresa value from sheet |
| empresa | text | Normalized company code |
| empresa_split | jsonb | `[{code, pct, importe_cop_allocated}]` for shared-entity allocations |
| no_fac / moneda / pagado / aprobado / orden_prioridad / doc_url | text | |
| synced_at | timestamptz | |

### `cuentas_por_pagar_cache`

Cache of outstanding payables from the CPP named range. Same structure as `transactions_cache` minus `pagado`; adds `aprobado text`. Full reload on sync.

Used by SearchPage action cards:
- Facturas Aprobadas: `aprobado = 'SI'`
- Facturas Pendiente Aprobación: `aprobado != 'SI'` AND `fecha_vencimiento <= end of current month`
- Cartera Vencida: `fecha_vencimiento < today`

### `suppliers_spend_monthly`

Aggregated supplier spend by entity and year. Used by ReportesBICPage. Populated by `sync-supplier-spend-2025` edge function.

| Column | Type | Notes |
|--------|------|-------|
| supplier_id | uuid | |
| entity | text | Company code (BA, TH, etc.) |
| year | integer | |
| amount_cop | numeric | |

---

## Edge Functions (`supabase/functions/`)

All are Deno runtime. All have origin-restricted CORS: allow `prov.portiahart.com` and `localhost:5173` only.

| Function | Trigger | Purpose |
|----------|---------|---------|
| `extract-rut` | Frontend (NewSupplierFlow) | Downloads RUT PDF/image from Storage signed URL → Claude (`claude-sonnet-4-20250514`) → returns `RUTData` + prefill `fields` object |
| `extract-banking` | Frontend (SupplierProfile Bancario tab) | Downloads Certificado Bancario from Storage → Claude → returns `BankingFields` (banco, tipo_cuenta, numero_cuenta, etc.) |
| `upload-document` | Frontend | Accepts base64 file + metadata; stores in `supplier-documents` bucket; inserts row into `suppliers_documents` |
| `sync-supplier-to-sheets` | DB webhook on `accounts_suppliers` INSERT/UPDATE | Mirrors updated row to Google Sheet "supabase-masterlist" tab (`1AFhvJXBJsfwbCVxyirJAJDIlRQDncPywfknkYl1h6O4`). Also accepts `{ type: "FULL_SYNC" }` for full reseed. |
| `sync-transactions-cache` | Manual / scheduled | Reads BANCOS, CASHAPP, TARSCOL, EXTRA from Google Sheets (service account JWT); full DELETE + INSERT reload into `transactions_cache` |
| `sync-bic-data` | Manual / scheduled | Reads DATABASEOLD range from Google Sheets; syncs BIC fields (cols AN–AU) to `accounts_suppliers` |
| `sync-pago-inmediato` | One-time manual | Reads DATABASEOLD col N (`Pago Inmediato`) from Google Sheets; sets `accounts_suppliers.pago_inmediato` boolean by NIT. Run once to seed; manage manually in-app thereafter. |
| `sync-supplier-spend-2025` | Manual / scheduled | Builds `suppliers_spend_monthly` from historical spend data |
| `bulk-sync-banking` | Manual | Bulk populate `suppliers_banking` for many suppliers at once |

**Required env secrets on hh-main:**
- `GOOGLE_SERVICE_ACCOUNT_JSON` — service account with Sheets read/write scope
- `ANTHROPIC_API_KEY` — for extract-rut and extract-banking
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase

---

## Environment Variables

| Var | Where | Notes |
|-----|-------|-------|
| `VITE_SUPABASE_URL` | Frontend (.env) | `https://dqfrqjsbfmwtclkclmvc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Frontend (.env) | Public anon key |

Edge function secrets are stored in Supabase Vault (not in .env).

---

## Table Standard

All data tables follow the **HH Table Design Standard** defined in `HH_ECOSYSTEM.md` (in the hh-accounts repo).

**Implementation:** `.hh-table` CSS class in `src/index.css`. Use `className="hh-table"` on every `<table>` element. Because this app has no shadcn/ui, all other UI is inline styles — tables are the exception, using the shared class.

**Download button:** `ExcelDownloadButton` component at `src/components/ExcelDownloadButton.tsx`. Renders `↓ XLSX` text button placed in the SectionCard `action` prop (right side of card header).

**Links in cells:** Inline style `color:'#4A9B8E'; textDecoration:'underline'; fontSize:'11px'; fontFamily:'DM Sans,system-ui,sans-serif'`. For document links that open a viewer, use the existing `openDoc()` pattern with a styled `<a>` tag — not a button.

**Export:** `exportTableToExcel()` from `src/lib/export-utils.ts`. Numbers raw, dates DD-MM-YYYY. Link columns (`doc_url`) appended automatically when any row has a URL.

---

## Key Conventions

- **No TanStack Query** — all data fetching in `useEffect` / `useCallback` with local `useState`. Pattern: set loading=true, fetch, set data, set loading=false.
- **No shadcn/ui** — all UI is inline styles as `React.CSSProperties` objects defined as constants at the bottom of each file. CSS variables (`--hh-teal`, `--hh-dark`, `--hh-haze`, `--hh-ice`, `--hh-white`, `--font-body`, `--font-display`) are defined globally.
- **suppliersQuery always for supplier lists** — never query `accounts_suppliers` directly for user-facing lists; always use `suppliersQuery()` to apply the X-prefix and archived_at filters.
- **Super admin checks are per-component** — no global role in context. Each component that needs admin privilege queries `crm_users.is_super_admin` using `session.user.id`.
- **empresa_split** — `jsonb` array `[{code, pct, importe_cop_allocated}]` used when an invoice is split across multiple companies. `matchesCompany()` and `allocatedAmount()` helpers in SearchPage handle this pattern; replicate them in any new component that reads transaction/CPP data.
- **Auth never awaited in onAuthStateChange callback** — see critical comment in `AuthContext.tsx`. This is a Supabase auth-js deadlock avoidance pattern; do not break it.
