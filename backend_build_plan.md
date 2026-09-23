# Backend Build Plan — Step-by-Step (Scoped to 5 Dashboards)

## Scope Reminder Before Starting

The 5 dashboards and what they need to function:

| Dashboard | What It Needs From Backend |
|---|---|
| Master Data | BOM FG Header, BOM Component lines, Vendor-Buyer, Vendor-Supplied Components CRUD |
| Monthly Upload | Week Definitions, Monthly Plan with proration |
| Monday Upload | MB51 transactions (CSV), Stock Report (MB52 CSV) |
| Update Delivery Schedule | Vendor Delivery Schedules CRUD + bulk Excel upload + audit log |
| Monday Review Cockpit | ALL of the above combined + MRP computation engine |

**The golden rule of this build plan:** Never build a dashboard before all of its data dependencies are working and tested. The cockpit is last because it consumes everything.

---

## PHASE 1 — Django Project Foundation

Nothing else can start without this. Do this once and get it right.

### Step 1 — Django Project Bootstrap

| Task | Detail |
|---|---|
| Create Django project | `django-admin startproject mps_backend` |
| Create app | `python manage.py startapp core` |
| Install packages | `djangorestframework`, `django-cors-headers`, `psycopg2-binary`, `python-decouple`, `openpyxl`, `djangorestframework-simplejwt` |
| Configure settings.py | Database → PostgreSQL; CORS → allow frontend origin; REST_FRAMEWORK defaults; JWT auth |
| Configure .env | `DATABASE_URL`, `SECRET_KEY`, `ALLOWED_HOSTS`, `ALLOW_DATA_RESET`, `DEFAULT_FG_UNIT_PRICE_INR` |
| URL routing | `api/urls.py` with versioned prefix `/api/` |

**Why first:** Every other step depends on this. Without a running Django project connected to PostgreSQL, nothing else is testable.

---

### Step 2 — PostgreSQL Database Creation

| Task | Detail |
|---|---|
| Create database | `CREATE DATABASE mps_db;` |
| Create user | `CREATE USER mps_user WITH PASSWORD '...';` |
| Grant privileges | `GRANT ALL ON DATABASE mps_db TO mps_user;` |
| Enable extensions | `CREATE EXTENSION IF NOT EXISTS pg_trgm;` — for trigram search on part numbers and descriptions |
| Verify connection | Run `python manage.py dbshell` and confirm connection |

---

### Step 3 — MinIO Setup (File Storage for Uploads)

| Task | Detail |
|---|---|
| Install MinIO locally or via Docker | `docker run -p 9000:9000 minio/minio server /data` |
| Install boto3 and django-storages | For S3-compatible MinIO integration |
| Configure MinIO bucket | `mps-uploads` bucket; set access policy |
| Add MinIO settings to .env | `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET_NAME` |
| Create StorageService utility | Single utility class that handles `upload_file(file_obj, path)` → returns `minio_path` string |

**Why now:** Every bulk upload in every dashboard stores the original file in MinIO before processing rows. The `upload_batch` table stores the `minio_path`. Build this once here so all upload views can call it identically.

---

## PHASE 2 — Core Models (Master Data)

Build all Django models in dependency order. Models with no FK parents go first.

### Step 4 — Model: `rm_pm_component_master`

| Task | Detail |
|---|---|
| Create Django model | Fields: `component_code`, `component_description`, `category`, `uom`, `default_storage_location`, `safety_stock`, `is_critical`, `is_common_part`, `shared_in_fgs_count`, `is_active` |
| Write migration | `python manage.py makemigrations && migrate` |
| Add model indexes | `component_code` (unique), `category`, `is_common_part`, `is_active` |
| Write serializer | `RMPMComponentSerializer` — all fields; `component_code` read-only after create |
| Write service method | `MaterialTypeService.derive(part_number)` → `'FG'` / `'RM'` / `'PM'` |

**Why first among models:** Has no FK parents. It is the parent of `bom_master`, `vendor_supplied_components`, `vendor_delivery_schedule`, and `stock_report`. Everything depends on it.

---

### Step 5 — Model: `bom_fg_header`

| Task | Detail |
|---|---|
| Create Django model | Fields: `fg_code`, `fg_description`, `mini_factory`, `line`, `customer_segment`, `unit_price_inr`, `active_bom_version`, `uom`, `is_active` |
| Write migration | Add unique constraint on `fg_code`; index on `mini_factory`, `line`, `is_active` |
| Write serializer | `BOMFGHeaderSerializer` — all fields; `fg_code` read-only after create |
| Add validation | `fg_code` must start with `'7'`; `active_bom_version` defaults to `'v1'` |

**Why now:** Has no FK parents. Is the parent of `bom_master`, `monthly_plan`, `monday_review_action`, `fg_plan_freeze`.

---

### Step 6 — Model: `bom_master`

| Task | Detail |
|---|---|
| Create Django model | Fields: `fg_code` (FK → `bom_fg_header`), `component_code` (FK → `rm_pm_component_master`), `qty`, `uom`, `component_role`, `bom_version`, `is_active`, `lead_time_days_override` |
| Write migration | Unique constraint on `(fg_code, component_code, bom_version)`; all four indexes from schema |
| Write serializer | `BOMMasterSerializer` — include nested `component_description` and `component_role` from `rm_pm_component_master` via `SerializerMethodField` |
| Add validation | `qty > 0`; `fg_code` starts with `'7'`; `component_code` does NOT start with `'7'` |
| Write service method | `BOMService.update_common_part_flags(component_code)` — after any BOM insert or delete: count distinct `fg_code` values for this `component_code`; update `rm_pm_component_master.is_common_part` and `shared_in_fgs_count` |

**Why now:** Depends on both `bom_fg_header` and `rm_pm_component_master`. Must come after Steps 4 and 5.

---

### Step 7 — Model: `vendor_buyer_master` + `vendor_supplied_components`

| Task | Detail |
|---|---|
| Create `vendor_buyer_master` model | Fields: `vendor_code`, `vendor_name`, `buyer_name`, `buyer_email`, `buyer_phone`, `category`, `lead_time_days`, `city`, `gst_no` |
| Create `vendor_supplied_components` model | Fields: `vendor_buyer` (FK → `vendor_buyer_master`), `component_code` (FK → `rm_pm_component_master`); unique on `(vendor_buyer, component_code)` |
| Write migration | Both models; unique constraints; all indexes |
| Write serializer | `VendorBuyerSerializer` with nested `supplied_components: [component_code]` list; on write, DELETE + re-INSERT the junction rows |
| Add validation | `lead_time_days > 0`; `vendor_code` unique; at least one component in `supplied_components` |

**Why now:** Both have `rm_pm_component_master` as a parent. `vendor_buyer_master` has no other parent. Both come before `vendor_delivery_schedule`.

---

### Step 8 — Model: `upload_batch`

| Task | Detail |
|---|---|
| Create Django model | Fields: `upload_type`, `uploaded_by`, `uploaded_at`, `file_name`, `minio_path`, `status`, `total_rows`, `imported_rows`, `error_rows`, `error_detail` (JSONField) |
| Write migration | Indexes on `(upload_type, status)`, `uploaded_at DESC` |
| Write serializer | `UploadBatchSerializer` — read-only; used in admin batch history listing |
| Write service | `UploadBatchService.create_batch(type, user, file_name)` → returns batch instance with `status = PENDING`; `UploadBatchService.complete(batch, imported, errors)` → sets `COMPLETED` or `PARTIAL`; `UploadBatchService.fail(batch, error)` → sets `FAILED` |

**Why now:** Every bulk upload view in every dashboard calls this service. It has no FK parents except itself. Build it once here and reuse across all 4 upload dashboards.

---

## PHASE 3 — Master Data API (Dashboard 5 — Master Data)

Now that all models exist, build the CRUD API for the Master Data dashboard.

### Step 9 — API: BOM FG Header CRUD

| Endpoint | View Class | Key Logic |
|---|---|---|
| `GET /api/bom/fg-headers/` | `BOMFGHeaderListCreateView` | Filter by `is_active`, `mini_factory`, `line`, `search`; paginate |
| `POST /api/bom/fg-headers/` | `BOMFGHeaderListCreateView` | Validate `fg_code` starts with `'7'`; default `active_bom_version = 'v1'` |
| `PATCH /api/bom/fg-headers/{fg_code}/` | `BOMFGHeaderDetailView` | If `active_bom_version` changes → emit warning in response that MRP results will change |
| `DELETE /api/bom/fg-headers/{fg_code}/` | `BOMFGHeaderDetailView` | Block if active `monthly_plan` rows exist for this `fg_code` |

---

### Step 10 — API: RM/PM Component Master CRUD

| Endpoint | View Class | Key Logic |
|---|---|---|
| `GET /api/components/` | `ComponentListCreateView` | Filter by `category`, `is_common_part`, `is_active`, `search`; paginate |
| `POST /api/components/` | `ComponentListCreateView` | Validate `component_code` does NOT start with `'7'`; `safety_stock ≥ 0` |
| `PATCH /api/components/{component_code}/` | `ComponentDetailView` | `component_code` read-only after create |
| `DELETE /api/components/{component_code}/` | `ComponentDetailView` | Block with 409 if any `bom_master` rows reference this `component_code` |

---

### Step 11 — API: BOM Master CRUD + Exploded BOM Endpoint

| Endpoint | View Class | Key Logic |
|---|---|---|
| `GET /api/bom/` | `BOMMasterListCreateView` | Filter by `fg_code`, `component_code`, `category`, `is_active`, `search`; paginate |
| `POST /api/bom/` | `BOMMasterListCreateView` | Validate both FK exist; validate `qty > 0`; call `BOMService.update_common_part_flags(component_code)` after insert |
| `PATCH /api/bom/{id}/` | `BOMMasterDetailView` | Re-validate after update; re-run `update_common_part_flags` if `component_code` or `qty` changed |
| `DELETE /api/bom/{id}/` | `BOMMasterDetailView` | Hard delete; call `update_common_part_flags` after deletion |
| `GET /api/bom/exploded/{fg_code}/` | `ExplodedBOMView` | Join `bom_master` → `rm_pm_component_master` → `vendor_supplied_components` → `vendor_buyer_master` → `stock_report`; return full component tree with `current_stock`, `stock_covers_units`, `vendor_name`, `buyer_name`, `is_common_part`, `shared_in_fgs_count` |
| `GET /api/bom/common-components/` | `CommonComponentsView` | Query `rm_pm_component_master WHERE is_common_part = TRUE`; annotate with list of consuming FGs |

---

### Step 12 — API: Vendor-Buyer Master CRUD

| Endpoint | View Class | Key Logic |
|---|---|---|
| `GET /api/vendor-buyers/` | `VendorBuyerListCreateView` | Filter by `buyer_name`, `category`, `vendor_code`, `search`; paginate; include nested `supplied_components` |
| `POST /api/vendor-buyers/` | `VendorBuyerListCreateView` | INSERT `vendor_buyer_master`; then bulk INSERT `vendor_supplied_components` rows from `supplied_components` list |
| `PATCH /api/vendor-buyers/{id}/` | `VendorBuyerDetailView` | If `supplied_components` in payload: DELETE all existing junction rows for this vendor then INSERT fresh list |
| `DELETE /api/vendor-buyers/{id}/` | `VendorBuyerDetailView` | Block with 409 if active `vendor_delivery_schedule` rows reference `vendor_code` |

**After Step 12 — Master Data dashboard is fully functional.** All five CRUD views (`BOMMasterManager`, `VendorBuyerManager`, and FG header/component management) have working API endpoints.

---

## PHASE 4 — Week Definitions and Monthly Plan (Dashboard 3 — Monthly Upload)

### Step 13 — Model + API: `week_definition`

| Task | Detail |
|---|---|
| Create Django model | All fields from schema; unique on `(month, week_no)`; indexes on `month`, `(start_date, end_date)` |
| Write migration | |
| Write serializer | `WeekDefinitionSerializer` — compute `days_count` and `working_days` server-side; expose `week_code` as read-only |
| Write service | `WeekService.generate_week_code(month, week_no)` → `w-{YYYY-MM}-{0N}`; `WeekService.compute_days(start_date, end_date, holiday_days)` → `(days_count, working_days)` |
| Endpoints | `GET /api/weeks/?month=YYYY-MM`; `POST /api/weeks/`; `PATCH /api/weeks/{id}/`; `DELETE /api/weeks/{id}/`; `POST /api/weeks/auto-generate/` |
| Cascade on PATCH | `WeekDetailView.perform_update()` → after updating dates or `holiday_days`, call `ProrateService.cascade_reprorate(month)` — re-run proration on all `monthly_plan` rows for the affected month |

---

### Step 14 — Model + API: `monthly_plan`

| Task | Detail |
|---|---|
| Create Django model | All fields; FK to `bom_fg_header`; unique on `(fg_code, month)`; GIN index on `weekly_breakdown` JSONB |
| Write migration | |
| Write serializer | `MonthlyPlanSerializer` — `weekly_breakdown` exposed as read-only computed field |
| Write service | `ProrateService.prorate(monthly_target, weeks)` — exact algorithm from Section 9: ratio by `working_days`, remainder to last week; `ProrateService.cascade_reprorate(month)` — bulk update all plans for a month when week definitions change |
| Endpoints | `GET /api/monthly-plans/?month=`; `POST /api/monthly-plans/`; `PATCH /api/monthly-plans/{id}/`; `DELETE /api/monthly-plans/{id}/` |
| Validation on POST | `fg_code` must exist in `bom_fg_header`; `weekly_breakdown` auto-computed — never accepted from client |

---

### Step 15 — Bulk Upload: Monthly Plan CSV

| Task | Detail |
|---|---|
| Write parser | `MonthlyPlanParser.parse(file_or_text, month)` — handles `.xlsx` via openpyxl; `.csv` via Python csv module; pasted text via string split; auto-detect delimiter (tab vs comma); skip header row if first cell contains `fg/code/material` |
| Write upload view | `MonthlyPlanBulkUploadView` — call `StorageService.upload_file()` → store original in MinIO; call parser; for each valid row call `ProrateService.prorate()`; upsert on `(fg_code, month)`; call `UploadBatchService.complete()` |
| Error handling | Per-row: if `fg_code` doesn't start with `'7'` → skip and log; if `monthly_target ≤ 0` → skip and log; if no `week_definition` rows for month → fail entire file with 400 |
| Endpoint | `POST /api/uploads/monthly-plan/` |

**After Step 15 — Monthly Upload dashboard is fully functional.** Week Definition Manager (define weeks, auto-generate, edit) and Monthly Plan Manager (upload CSV, manual add, view prorated breakdown) are all working.

---

## PHASE 5 — Monday Upload (Dashboard 4)

### Step 16 — Model: `mb51_transaction`

| Task | Detail |
|---|---|
| Create Django model | All fields from schema; FK to `week_definition` (SET NULL); FK to `upload_batch` (SET NULL) |
| Write migration | Composite index on `(part_number, classification, week_code)`; index on `posting_date`, `material_document`, `classification` |
| Write serializer | `MB51TransactionSerializer` — `classification` and `week_code` are read-only computed fields |
| Write service | `MB51ClassificationService.classify(movement_type, part_number)` — exact logic from Section 9; `WeekMappingService.map_to_week(posting_date, week_definitions)` — date range scan |

---

### Step 17 — API: MB51 CRUD + Bulk Upload

| Task | Detail |
|---|---|
| Single create endpoint | `POST /api/mb51/` — validate `quantity > 0`; `movement_type IN ('101', '601')`; call classify + map_to_week; INSERT |
| List endpoint | `GET /api/mb51/` — filters: `month`, `week_code`, `movement_type`, `part_number`, `classification`, `date_from`, `date_to`; paginate |
| Delete endpoint | `DELETE /api/mb51/{id}/` — hard delete |
| Bulk upload view | `MB51BulkUploadView` — store file in MinIO via `StorageService`; call `MB51Parser.parse(file_or_text, month_weeks)`; call classify + map_to_week per row; flag duplicate `material_document` values (warn, do not block); bulk INSERT; call `UploadBatchService.complete()` |
| Parser | `MB51Parser.parse()` — min 4 columns: `material_document`, `posting_date`, `movement_type`, `part_number`, `quantity`, `uom`, `sloc`, `vendor_customer`; tab/comma auto-detect; strip quotes; skip header if first cell lowercased contains `mat/mvt/doc` |
| Endpoint | `POST /api/uploads/mb51/` |
| CSV export | `GET /api/exports/mb51-csv/?month=&week_code=&classification=` — Django `StreamingHttpResponse` with CSV writer |

---

### Step 18 — Model: `stock_report`

| Task | Detail |
|---|---|
| Create Django model | All fields from schema; unique on `(part_number, storage_location)`; FK to `upload_batch` (SET NULL) |
| Write migration | Indexes on `part_number`, `(part_number, storage_location)`, `material_type` |
| Write serializer | `StockReportSerializer` — `material_type` read-only computed from `part_number` prefix |

---

### Step 19 — API: Stock Report CRUD + Bulk Upload

| Task | Detail |
|---|---|
| List endpoint | `GET /api/stock/` — filters: `material_type`, `part_number`, `storage_location`, `search`, `below_safety_stock=true`; paginate |
| Single create | `POST /api/stock/` — call `MaterialTypeService.derive(part_number)`; check `(part_number, storage_location)` unique; INSERT |
| Update | `PATCH /api/stock/{id}/` — re-derive `material_type` if `part_number` changes |
| Delete | `DELETE /api/stock/{id}/` — hard delete |
| Bulk upload view | `StockBulkUploadView` — store in MinIO; `StockParser.parse(file_or_text)`; derive `material_type` per row; upsert on `(part_number, storage_location)` when `mode=replace`; INSERT when `mode=append`; call `UploadBatchService.complete()` |
| Parser | `StockParser.parse()` — min 2 columns: `part_number`, `description`, `unrestricted_stock`, `in_quality_insp`, `blocked`, `safety_stock`, `uom`, `sloc`; same header-skip and delimiter-detect logic as MB51 |
| Endpoint | `POST /api/uploads/stock-report/` |
| CSV export | `GET /api/exports/stock-csv/?material_type=` |

**After Step 19 — Monday Upload dashboard is fully functional.** MB51 upload/view/delete and Stock Report upload/view/delete are both working.

---

## PHASE 6 — Vendor Delivery Schedule (Dashboard 2)

### Step 20 — Model: `vendor_delivery_schedule` + `delivery_schedule_change_log`

| Task | Detail |
|---|---|
| Create `vendor_delivery_schedule` model | All fields from schema; FK to `rm_pm_component_master` (RESTRICT); FK to `week_definition` (SET NULL); FK to `upload_batch` (SET NULL) |
| Create `delivery_schedule_change_log` model | All fields from schema; FK to `vendor_delivery_schedule` (SET NULL) |
| Write migrations | Both models; all indexes |
| Write serializer | `VendorDeliveryScheduleSerializer`; `DeliveryScheduleChangeLogSerializer` (read-only) |
| Write audit service | `AuditLogService.create_log(schedule, changed_by, reason, changed_fields_dict)` — compares old vs new values; writes one `delivery_schedule_change_log` row per changed field; this service is called by ALL schedule mutation operations — never skip it |

---

### Step 21 — API: Vendor Delivery Schedule CRUD

| Task | Detail |
|---|---|
| List endpoint | `GET /api/vendor-delivery-schedules/` — filters: `month`, `week_code`, `component_code`, `vendor_code`, `buyer_name`, `delivery_status`, `search`; paginate; JOIN `vendor_buyer_master` for buyer contact fields |
| Create endpoint | `POST /api/vendor-delivery-schedules/` — validate `promised_qty > 0`; validate `changed_by` + `reason` non-empty; call `WeekMappingService.map_to_week(expected_delivery_date)`; INSERT schedule; call `AuditLogService.create_log()` with `field_changed = 'CREATED'` |
| Update endpoint | `PATCH /api/vendor-delivery-schedules/{id}/` — snapshot old field values before update; PATCH row; re-resolve `week_code` if `expected_delivery_date` changed; call `AuditLogService.create_log()` for each changed field — one log row per field |
| Delete endpoint | `DELETE /api/vendor-delivery-schedules/{id}/` — validate `reason` non-empty in request body; call `AuditLogService.create_log()` with `field_changed = 'CANCELLED/DELETED'`; then hard DELETE schedule row |
| Change log endpoint | `GET /api/vendor-delivery-schedules/change-logs/` — filters: `po_number`, `component_code`, `vendor_name`, `schedule_id`, `date_from`, `date_to`; paginate; order by `changed_at DESC` |

---

### Step 22 — Bulk Upload: Vendor Delivery Schedule Excel/CSV

| Task | Detail |
|---|---|
| Write parser | `VendorScheduleParser.parse(file, month, weeks)` — handle `.xlsx/.xls` via openpyxl; `.csv` via csv module; pasted text via `PastedTextParser`; match columns by name (case-insensitive, spaces → underscores); call `WeekMappingService.map_to_week()` per row; validate `component_code` exists in `rm_pm_component_master`; auto-resolve `vendor_name` and `buyer_name` from `vendor_buyer_master` if blank in file |
| Write upload view | `VendorScheduleBulkUploadView` — store file in MinIO; call parser; for each valid row INSERT schedule; call `AuditLogService.create_log()` with `field_changed = 'BULK_UPLOAD_CREATED'` per inserted row; call `UploadBatchService.complete()` |
| Rejected rows | Return in response as `rejected: [{row: N, po_number: 'X', component_code: 'Y', error: 'Z'}]` |
| Endpoint | `POST /api/uploads/vendor-delivery-schedules/` |

---

### Step 23 — Excel Template Download Endpoints

| Endpoint | View | Logic |
|---|---|---|
| `GET /api/exports/vendor-schedule-blank-template/?month=` | `VendorScheduleBlankTemplateView` | Build openpyxl workbook; write 12 column headers per Upload 4 spec; write 2 sample rows with realistic placeholder data; set column widths; stream as `.xlsx` |
| `GET /api/exports/vendor-schedule-prefilled/?month=&week_code=&scope=` | `VendorSchedulePrefilledTemplateView` | Call `RMRequirementsService.compute(month)` (built in Phase 7); filter shortage components; populate one template row per shortage component with `component_code`, `vendor_code`, `suggested_date = week start_date`, `suggested_qty = deficit`; stream as `.xlsx` |
| `GET /api/exports/rm-matrix-report/?month=&week_code=&buyer_name=` | `RMMatrixExportView` | Call `RMRequirementsService.compute(month)`; build matrix sheet with one row per component and one column pair per week; apply conditional cell fill: red for SHORTAGE, amber for WARNING; stream as `.xlsx` |

**After Step 23 — Update Delivery Schedule dashboard is fully functional.** Schedule list/create/edit/delete, bulk Excel upload, change log history, blank template download, and pre-filled template download are all working.

---

## PHASE 7 — MRP Calculation Engine (Core of Monday Review Cockpit)

This is the hardest phase. Build each computation service independently with unit tests before wiring to API views.

### Step 24 — Service: `WeekMappingService` (already partially built in Step 13; finalize here)

| Task | Detail |
|---|---|
| Finalize `map_to_week(posting_date, weeks)` | Sort weeks by `start_date`; return first `week_code` where `start_date ≤ posting_date ≤ end_date`; return `None` if no match |
| Add `is_date_in_week(date_str, week)` helper | Used inside FG coverage and RM requirement loops |
| Write unit tests | Test: date in middle of week → correct week; date in gap → `None`; date in first/last week → correct boundary |

---

### Step 25 — Service: `FGCoverageService.compute(month)`

| Task | Detail |
|---|---|
| Inputs pulled from DB | `monthly_plan WHERE month = selected_month`; `week_definition WHERE month = selected_month` ordered by `week_no`; `mb51_transaction WHERE week_code IN (month_week_codes) AND classification IN ('FG_PRODUCTION_RECEIPT', 'FG_DISPATCH')` |
| Computation | For each plan: find starting stock from `stock_report`; for each week: sum FG receipts (Mvt 101 prefix-7); sum dispatches (Mvt 601); compute variance, rolling `closing_stock`; compute `overall_achievement_rate` |
| Query optimization | Pre-aggregate MB51 data into dicts keyed by `(part_number, week_code)` BEFORE the plan loop — never query inside the loop |
| Output | `List[FGWeeklyCoverageSummary]` — pure Python dataclass; not persisted to DB |
| Unit tests | Test: zero MB51 data → achievement 0%; over-production → rate > 100%; starting stock missing → defaults to 0 |
| Wire to endpoint | `GET /api/reports/fg-weekly-coverage/?month=` → `FGWeeklyCoverageView` |

---

### Step 26 — Service: `RMRequirementsService.compute(month)`

| Task | Detail |
|---|---|
| Inputs pulled from DB | `bom_master WHERE is_active = TRUE AND bom_version = bom_fg_header.active_bom_version`; `monthly_plan WHERE month = selected_month`; `week_definition` for month; `mb51_transaction WHERE classification = 'RMPM_RECEIPT' AND week_code IN (month_week_codes)`; `stock_report` for all component codes; `vendor_supplied_components + vendor_buyer_master` for buyer resolution |
| Computation steps | 1. Group `bom_master` by `component_code` → dict of `{component_code: [{fg_code, qty}]}`; 2. For each component: BOM-explode gross req per week = Σ(`plan.weekly_breakdown[week]` × `bom_qty`) across all consuming FGs; 3. Aggregate MB51 inward per week; 4. Rolling `projected_stock` per week; 5. Classify status + deficit per week; 6. Set `overall_status` (worst week wins) |
| Query optimization | Load ALL `monthly_plan.weekly_breakdown` JSONB into memory first; load ALL `mb51_transaction` aggregated into dict `{(part_number, week_code): total_qty}`; load ALL `stock_report` into dict `{part_number: unrestricted_stock}`; load ALL `vendor_supplied_components` into dict `{component_code: vendor_buyer_info}`; zero DB queries inside the component loop |
| Output | `List[RMWeeklyRequirementSummary]` — pure Python; not persisted |
| Unit tests | Test: common component used in 3 FGs → gross req = sum of all three plans × respective qty; safety stock = 0 → WARNING threshold disappears; no stock row → opening stock = 0 |
| Wire to endpoint | `GET /api/reports/rm-weekly-requirements/?month=&buyer_name=&status=` → `RMWeeklyView` |

---

### Step 27 — Service: `CriticalShortagesCountService` + Materialized View

| Task | Detail |
|---|---|
| Write service | `CriticalShortagesCountService.count(month)` — call `RMRequirementsService.compute(month)`; count rows where `overall_status = 'SHORTAGE'` |
| Wire to endpoint | `GET /api/reports/critical-shortages-count/?month=` → `CriticalShortagesCountView` |
| Materialized view | Create `mv_critical_shortages_count` in a Django migration using `RunSQL`; schedule `REFRESH MATERIALIZED VIEW CONCURRENTLY` via Celery beat every 5 minutes |

**Why Celery now:** The Header badge calls this endpoint on every page load. Without the materialized view refresh, every load triggers a full MRP computation. Celery beat keeps the view fresh so the endpoint just does a 1-row SELECT.

---

### Step 28 — Service: `PlanFreezeService` + API

| Task | Detail |
|---|---|
| Create model | `fg_plan_freeze` — all fields from schema; FK to `bom_fg_header` (RESTRICT); FK to `week_definition` (RESTRICT) |
| Write migration | Unique on `(fg_code, month, week_code)`; indexes on `(month, fg_code)` and `status` |
| Write service | `PlanFreezeService.upsert(fg_code, month, week_code, new_status, user_role, frozen_by, freeze_notes)` — validate forward-only transition; validate `monthly_plan` exists; set `frozen_at = now()` on FROZEN; upsert row |
| List endpoint | `GET /api/plan-freeze/?month=&fg_code=&week_code=&status=` |
| Update endpoint | `POST /api/plan-freeze/` — validate role is `supply_planner` or `management` (403 otherwise); call `PlanFreezeService.upsert()` |

---

### Step 29 — Service: `MondayReviewActionService` + API

| Task | Detail |
|---|---|
| Create model | `monday_review_action` — all fields from schema; FKs to `bom_fg_header`, `week_definition`, `rm_pm_component_master` (SET NULL) |
| Write migration | Indexes from schema |
| Endpoints | `GET /api/monday-review-actions/`; `POST /api/monday-review-actions/`; `PATCH /api/monday-review-actions/{id}/`; `DELETE /api/monday-review-actions/{id}/` |
| Validation | `target_resolution_date` must not be in the past; `assigned_owner` must be non-empty; `issue_type` must be valid enum |

---

### Step 30 — Service: `CockpitService.compute(month, week_code)` — Monday Review Cockpit Engine

This is the most complex service in the project. Build it last in Phase 7 because it calls everything built before it.

| Task | Detail |
|---|---|
| Inputs | All of: `monthly_plan`, `week_definition`, `bom_master`, `bom_fg_header`, `rm_pm_component_master`, `vendor_buyer_master`, `vendor_supplied_components`, `mb51_transaction`, `stock_report`, `vendor_delivery_schedule`, `monday_review_action`, `fg_plan_freeze` |
| Step 1 | Load all data into memory-optimized dicts before any computation begins — zero queries inside loops |
| Step 2 | For each FG plan in selected month: compute `prior_backlog` = Σ max(0, `plan_target − actual_prod`) for all prior weeks |
| Step 3 | Compute `total_week_gross_target = current_week_plan + prior_backlog` |
| Step 4 | Explode BOM for each FG using `bom_master` dict: list all active component lines at `active_bom_version` |
| Step 5 | For each component: resolve `unreserved_available_stock` — deduct frozen-plan reservations from OTHER frozen FGs that share this component using `fg_plan_freeze + bom_master qty` |
| Step 6 | Compute `max_buildable_fg_with_stock` = min over all components of `floor(unreserved_stock / bom_qty)`; record `bottleneck_component_code` |
| Step 7 | Sum `scheduled_inward` per component from `vendor_delivery_schedule WHERE delivery_status NOT IN ('CANCELLED') AND week_code = selected_week` |
| Step 8 | Compute `max_buildable_fg_with_deliveries` = min over all components of `floor((unreserved_stock + scheduled_inward) / bom_qty)` |
| Step 9 | Classify `fg_health_status` using priority rules from Section 9 |
| Step 10 | Build `all_weeks_detail` array — W1 to W4 horizon for each FG |
| Step 11 | Attach `monday_review_actions` list for each FG from pre-loaded action dict |
| Step 12 | Compute summary counters: `critical_fgs_count`, `inadequate_delivery_count`, `active_escalations_count`, `frozen_fgs_count`, `overall_backlog_units` |
| Output | `CockpitResult` dataclass with `cockpit_items`, `selected_week`, `month_weeks`, and all summary counters |
| Performance target | Full computation for 10 FGs × 5 weeks × 20 components should complete in under 500ms; use `select_related` and `prefetch_related` for all ORM queries; profile with django-silk before going live |
| Unit tests | Test: `prior_backlog = 0` when first week selected; common component shared between 3 FGs with one FROZEN → reservation deducted for that frozen FG only; `maxBuildable = 0` when any single component stock = 0 |
| Wire to endpoint | `GET /api/reports/monday-review-cockpit/?month=&week_code=&fg_code=&status=` → `MondayReviewCockpitView` |

**After Step 30 — Monday Review Cockpit dashboard is fully functional.**

---

## PHASE 8 — Polish, Exports, and Admin

### Step 31 — All CSV/Excel Export Endpoints

| Endpoint | View | Builds On |
|---|---|---|
| `GET /api/exports/monthly-plan-csv/?month=` | `MonthlyPlanCSVExportView` | Phase 4 |
| `GET /api/exports/mb51-csv/?month=&classification=` | `MB51CSVExportView` | Phase 5 |
| `GET /api/exports/stock-csv/?material_type=` | `StockCSVExportView` | Phase 5 |
| `GET /api/exports/rm-matrix-report/?month=&week_code=` | `RMMatrixExportView` | Phase 7 Step 26 |
| `GET /api/exports/vendor-schedule-blank-template/?month=` | `VendorScheduleBlankTemplateView` | Phase 6 |
| `GET /api/exports/vendor-schedule-prefilled/?month=&scope=` | `VendorSchedulePrefilledTemplateView` | Phase 6 + Phase 7 Step 26 |

All export views use Django `StreamingHttpResponse` with the correct `Content-Disposition` header for file download.

---

### Step 32 — Upload Batch Admin Endpoint

| Endpoint | View | Logic |
|---|---|---|
| `GET /api/uploads/batches/` | `UploadBatchListView` | Filter by `upload_type`, `status`, `date_from`, `date_to`; paginate; order by `uploaded_at DESC` |

---

### Step 33 — Data Reset Endpoint (Dev/Demo Only)

| Endpoint | View | Logic |
|---|---|---|
| `POST /api/admin/reset-data/` | `DataResetView` | Block unless `settings.ALLOW_DATA_RESET = True`; validate `{confirm: true}` in body; TRUNCATE all 13 operational tables in FK-safe dependency order; re-seed from Django fixtures; `REFRESH MATERIALIZED VIEW mv_critical_shortages_count` |

---

## Full Build Order Summary

| Phase | Step | What Gets Built | Dashboard Unblocked |
|---|---|---|---|
| 1 | 1 | Django project bootstrap | — |
| 1 | 2 | PostgreSQL setup | — |
| 1 | 3 | MinIO setup + StorageService | — |
| 2 | 4 | `rm_pm_component_master` model | — |
| 2 | 5 | `bom_fg_header` model | — |
| 2 | 6 | `bom_master` model | — |
| 2 | 7 | `vendor_buyer_master` + `vendor_supplied_components` models | — |
| 2 | 8 | `upload_batch` model + `UploadBatchService` | — |
| 3 | 9 | BOM FG Header CRUD API | — |
| 3 | 10 | RM/PM Component Master CRUD API | — |
| 3 | 11 | BOM Master CRUD + Exploded BOM API | — |
| 3 | 12 | Vendor-Buyer Master CRUD API | ✅ Master Data |
| 4 | 13 | `week_definition` model + API | — |
| 4 | 14 | `monthly_plan` model + API + `ProrateService` | — |
| 4 | 15 | Monthly Plan bulk CSV upload | ✅ Monthly Upload |
| 5 | 16 | `mb51_transaction` model + `ClassificationService` | — |
| 5 | 17 | MB51 CRUD + bulk upload API | — |
| 5 | 18 | `stock_report` model | — |
| 5 | 19 | Stock Report CRUD + bulk upload API | ✅ Monday Upload |
| 6 | 20 | `vendor_delivery_schedule` + `delivery_schedule_change_log` models + `AuditLogService` | — |
| 6 | 21 | Vendor Delivery Schedule CRUD API | — |
| 6 | 22 | Vendor Delivery Schedule bulk Excel/CSV upload | — |
| 6 | 23 | Excel template download endpoints | ✅ Update Delivery Schedule |
| 7 | 24 | `WeekMappingService` (finalize + test) | — |
| 7 | 25 | `FGCoverageService` + endpoint | — |
| 7 | 26 | `RMRequirementsService` + endpoint | — |
| 7 | 27 | `CriticalShortagesCountService` + materialized view + Celery beat | — |
| 7 | 28 | `PlanFreezeService` + API | — |
| 7 | 29 | `MondayReviewActionService` + API | — |
| 7 | 30 | `CockpitService` (full engine) + endpoint | ✅ Monday Review Cockpit |
| 8 | 31 | All CSV/Excel export endpoints | — |
| 8 | 32 | Upload Batch admin endpoint | — |
| 8 | 33 | Data Reset endpoint (dev only) | — |
