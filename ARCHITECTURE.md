# hh-suppliers Architecture

**Repo:** portiahart/hh-suppliers
**Supabase project:** hh-main (`dqfrqjsbfmwtclkclmvc`)
**Deployed:** prov.portiahart.com
**Last updated:** 2026-05-27

---

## Overview

Supplier database management app for Hart Hospitality. Staff can search, create, and manage supplier records; view payables dashboards; run Colombian tax retention (retenciones) calculations from parsed RUT documents; and produce BIC (B Corp Impact Colombia) reports. All data lives in hh-main Supabase.

**hh-main is a shared Supabase instance.** Multiple HH apps (hh-suppliers, hh-accounts, hh-crm, hh-corazon, etc.) all connect to the same project (`dqfrqjsbfmwtclkclmvc`). Many tables are owned or populated by one app and read by others. When you see a table this app didn't create or doesn't write to, it belongs to another app in the ecosystem. Do not assume a table is stale or missing just because it isn't documented in this file — verify against the DB first.

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
| `/incompletos/:category` | IncompletosPage | Protected |
| `/cxp` | CxPPage | Protected |

---

## Pages (`src/pages/`)

### SearchPage (`/`)

Main dashboard. Three sections:

**Hero search** — typeahead input with 250ms debounce. Searches `accounts_suppliers` via `suppliersQuery` with `OR(razon_social.ilike, nombre_operativo.ilike, nit.ilike)`, limit 8. Results shown in dropdown; click navigates to `/suppliers/:id`.

**Two Top 20 tables (last 60 days):**

*Top 20 Proveedores* — money out (negative flows), grouped by NIT. Sources:
- `accounts_bancos` where `importe_cop < 0` (paginated 1000/page, already COP)
- `accounts_transactions` where `type = 'expense'` — amount always positive, currency converted via `trm_daily`; `supplier_id` resolved to NIT via `accounts_suppliers`; `company_id` resolved to empresa code via `companies`
- `wise_transactions` where `type = 'DEBIT'` and nit/empresa not null — `amount_value` converted via `trm_daily`
- `mercury_transactions` where `amount < 0` and nit/empresa not null — converted via `trm_daily`
Shows entity pills per HH company. Loads `suppliers_assessment.pass` badges.

*Top 20 Clientes* — money in (positive flows), grouped by NIT. Sources:
- `accounts_bancos` where `importe_cop > 0`
- `wise_transactions` where `type = 'CREDIT'` and nit/empresa not null
- `mercury_transactions` where `amount > 0` and nit/empresa not null
Note: `accounts_transactions.type='sales_allocation'` has no client NIT so is excluded.

**Currency conversion:** `trm_daily` (columns: `date`, `usd_cop`, `gbp_cop`, `eur_cop`) is fetched for the period, sorted descending. Each non-COP amount is converted using the latest rate on or before the transaction date.

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
| Gasto | Spend history and outstanding payables filtered by NIT; month-by-month aggregates by entity |
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

**Gasto tab data sources** (three queries, all by NIT):
1. `accounts_bancos` — historical transactions (shared table, owned/populated by hh-accounts). Columns used: `fecha_operacion`, `fecha_factura`, `proveedor`, `nit`, `importe_cop`, `monto_base`, `total_iva`, `total_ipc`, `rete_fuente`, `rete_ica`, `concepto`, `centro_costo`, `empresa`, `no_factura`, `doc_url`, `range_source`.
2. `cxp_facturas` — outstanding payables where `pagado = 'POR PAGAR'`, ordered by `fecha_vencimiento`.
3. `suppliers_spend_monthly` — aggregated monthly spend by entity (by `supplier_id`, not NIT).

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

### `cxp_facturas` (shared with hh-accounts)

Accounts payable invoices from the xPP named range in Google Sheets. **Schema owned by hh-suppliers; read by hh-accounts for reconciliation.**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | Auto-generated; no sheet equivalent |
| `sheet_uuid` | text UNIQUE | Permanent row identifier from the sheet (col AI, range index 34). Conflict key for upsert. |
| `sheet_row_num` | integer | 1-based row in the xPP range (for debugging) |
| `proveedor` | text | Supplier name (col S, index 18; fallback: col B, index 1) |
| `nit` | text | |
| `no_factura` | text | |
| `concepto` | text | |
| `tipo_documento` | text | |
| `tipo_egreso` | text | |
| `fecha_factura` | date | |
| `fecha_vencimiento` | date | |
| `fecha_pago` | date | |
| `valor_total` | numeric | |
| `monto_base` / `dcto` | numeric | |
| `iva_19` / `iva_5` / `ipc` / `otros_exentos` | numeric | Tax breakdowns |
| `tasa_retefuente` / `retefuente` | numeric | |
| `tasa_reteica` / `reteica` | numeric | |
| `empresa` | text | |
| `centro_costo` | text | |
| `metodo_pago` | text | |
| `pagado` | text | `'POR PAGAR'` or `'PAGADO'` — col AA (index 26). Sheet is authoritative. |
| `aprobado` | text | `'SI'`, `'NO'`, or null — col AB (index 27). App writes this TO the sheet; sheet syncs it back. |
| `orden_prioridad` | text | Col AC (index 28). Same write direction as aprobado. |
| `doc_url` / `comprobante_url` / `bot_email` | text | |
| `created_at` / `updated_at` | timestamptz | |

**Sync architecture — CRITICAL rules:**

| Direction | Columns | Rule |
|-----------|---------|------|
| Sheet → Supabase | ALL columns | Sheet **always wins** — direct assignment, no COALESCE |
| Supabase → Sheet | `aprobado` (col AB), `orden_prioridad` (col AC) only | App writes via `update-xpp` or `approve-cxp` edge functions |

- **Never DELETE rows.** Historical rows (`pagado='PAGADO'`) must persist for reconciliation. Sync is UPSERT only.
- **`supabase_id` column was dropped from DB on 2026-05-25.** NEVER re-add it. The sheet column AI (range index 34) is `sheet_uuid`, not supabase_id.
- **Two sync mechanisms run concurrently:**
  1. **pg_cron (primary):** `sync-cxp-every-10min` job fires every 10 minutes → calls the `sync-cxp` Edge Function. Enabled in `supabase/migrations/*_cxp_setup.sql`.
  2. **Vercel cron (secondary):** `api/cron/sync-cxp.ts` in hh-accounts, runs daily at 13:00 UTC → calls the `upsert_cxp_from_sheet` RPC.

Both use `sheet_uuid` (range index 34) as the conflict key. Both apply sheet-wins semantics. Both normalize `aprobado` (blank → null, TRUE/SI/SÍ → 'SI', else → 'NO').

### `accounts_transactions` (shared — owned by hh-accounts)

The primary structured transaction ledger. All amounts are always **positive**; the `type` field determines direction.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| type | text | `'expense'` (money out) · `'sales_allocation'` (money in) · `'transfer_in'` / `'transfer_out'` (ignore for top-20) · `'previous_balance'` |
| amount | numeric | Always positive |
| currency | text | `'COP'`, `'USD'`, `'GBP'`, `'EUR'` |
| transaction_date | date | |
| company_id | uuid FK | → `companies(id)` — which HH entity. Resolve to empresa code via `companies.name`. |
| supplier_id | uuid FK | → `accounts_suppliers(id)` — set for `type='expense'` |
| cost_centre | text | |
| receipt_url | text | |
| user_id / cashapp_user_id | uuid | CashApp user, if applicable |

hh-suppliers reads this table for the top-20 supplier list (type='expense'). Never writes except during supplier merge (reparenting supplier_id). `sales_allocation` rows have no client NIT so are excluded from the clients top-20.

### `wise_transactions` (shared — owned by hh-accounts)

Wise bank/card transactions. Reconciliation fields (`nit`, `empresa`, `proveedor`) are populated manually in hh-accounts.

| Column | Type | Notes |
|--------|------|-------|
| reference_number | text PK | |
| date | date | |
| amount_value | numeric | Absolute amount in `amount_currency`. Always positive for DEBIT/CREDIT. |
| amount_currency | text | `'USD'`, `'GBP'`, `'EUR'`, `'COP'` |
| type | text | `'DEBIT'` (expense) · `'CREDIT'` (income) |
| details_type | text | `'CARD'`, `'TRANSFER'`, etc. |
| empresa | text | HH entity code (BA, TH, …) — set after reconciliation |
| nit | text | Counterparty NIT — set after reconciliation |
| proveedor | text | Counterparty name — set after reconciliation |
| counterparty_name | text | Raw counterparty from Wise |
| concepto | text | |

hh-suppliers reads this table for both top-20 lists. Only rows with `nit IS NOT NULL AND empresa IS NOT NULL` are included (reconciled).

### `mercury_transactions` (shared — owned by hh-accounts)

Mercury bank/card transactions. Same reconciliation pattern as wise_transactions.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| posted_at | timestamptz | Use `.slice(0,10)` for date lookups |
| amount | numeric | Negative = expense (money out). Positive = income (money in). |
| currency | text | `'USD'`, `'GBP'`, `'EUR'`, `'COP'` |
| kind | text | `'creditCardTransaction'`, `'outgoingPayment'`, `'incomingPayment'`, etc. |
| empresa | text | HH entity code — set after reconciliation |
| nit | text | Counterparty NIT — set after reconciliation |
| proveedor | text | Counterparty name — set after reconciliation |
| counterparty_name | text | Raw counterparty from Mercury |

hh-suppliers reads this for both top-20 lists (negative = suppliers, positive = clients). Only reconciled rows (nit + empresa not null) included.

### `trm_daily` (shared — owned by hh-accounts)

Daily exchange rates used to convert non-COP amounts to COP.

| Column | Type | Notes |
|--------|------|-------|
| date | date PK | |
| usd_cop | numeric | USD → COP rate |
| gbp_cop | numeric | GBP → COP rate |
| eur_cop | numeric | EUR → COP rate |

Pattern: fetch for the period sorted descending. For each transaction, find the first row where `date <= transaction_date` (most recent rate on or before that date).

### `companies` (shared — owned by hh-accounts)

HH legal entities. Used to resolve `accounts_transactions.company_id` → empresa code.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | Empresa code (BA, TH, GA, PM, MA, HH, AB, AW, CR, etc.) |

### `accounts_bancos` (shared — owned by hh-accounts)

The primary transactions ledger for Hart Hospitality. Populated by hh-accounts from Google Sheets named ranges (BANCOS, CASHAPP, TARSCOL, EXTRA) and other sources. hh-suppliers reads it but never writes to it.

Columns used by hh-suppliers: `nit`, `importe_cop`, `empresa`, `fecha_operacion`, `fecha_factura`, `proveedor`, `monto_base`, `total_iva`, `total_ipc`, `rete_fuente`, `rete_ica`, `concepto`, `centro_costo`, `no_factura`, `doc_url`, `range_source`.

`range_source` identifies the origin sheet range (equivalent to `source` in the old `transactions_cache` schema). Do not attempt to write to this table from hh-suppliers.

### `accounts_transactions` (shared — owned by hh-accounts)

Structured transaction records linked to `accounts_suppliers` by `supplier_id`. hh-suppliers writes to it only during the supplier merge flow (to reparent transactions from the absorbed supplier to the survivor). Schema not fully documented here — treat as hh-accounts territory.

### `contact_supplier_links` (shared — owned by hh-crm)

Junction table linking CRM contacts to supplier profiles. Queried by the Contactos CRM tab via a Supabase join: `contact_supplier_links(id, contact_id, role, is_primary, contacts(first_name, last_name, email, phone))`. hh-suppliers reads only — links are created from the CRM app.

### `transactions_cache` (legacy — no longer queried by hh-suppliers)

Cache of expense transactions from Google Sheets ranges. Full DELETE + INSERT on each sync (not upsert). Synced by `sync-transactions-cache` edge function from BANCOS, CASHAPP, TARSCOL, EXTRA named ranges. **hh-suppliers frontend no longer queries this table** — it now reads `accounts_bancos` instead. The edge function and table may still exist for other consumers.

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

### `cuentas_por_pagar_cache` (legacy — no longer queried by hh-suppliers)

Cache of outstanding payables from the CPP named range. Same structure as `transactions_cache` minus `pagado`; adds `aprobado text`. Full reload on sync. **hh-suppliers now uses `cxp_facturas` for payables data.** This table may still be used by other apps.

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
| `sync-cxp` | pg_cron every 10 min | Reads xPP named range from Google Sheets; UPSERTs into `cxp_facturas` on `sheet_uuid`. No DELETE. Sheet wins all columns. Normalizes `aprobado`. See `cxp_facturas` schema above for full sync rules. |

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
