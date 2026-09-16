# Stage 8 — Sham Cash Integration: BLOCKED (official contract required)

**Status:** HARD STOP (per the Stage 8 rule: never guess an external payment contract).
**Date:** 2026-09-15
**Project:** /root/alwled (Stages 1–7 complete; Stage 7 payments architecture intact and untouched)

---

## 1. What was searched (evidence)

| Where | Result |
| --- | --- |
| `/root/alwled` (whole repo, incl. README, migrations, config) | No Sham Cash documentation, no credentials, no endpoints, no webhook spec. Only the Stage 7 method enum value `SHAM_CASH` and comments describing the future provider. |
| `.env` / `.env.example` | No Sham Cash variables at all (only DB/JWT/rate-limit/seed variables). |
| Shell environment (`env`) | No Sham Cash variables set on the server. |
| Server-wide grep (`/root`, `/opt`, `/srv`, `/home`) | No official Sham Cash merchant documentation or API credentials anywhere. |
| `~/.hermes/API_KEYS.md` | Contains OpenCode/NVIDIA/You.com/GitHub/Cloudflare keys only — **no** Sham Cash keys. |
| `~/.hermes/cache/documents/` | Only `Report.docx` (unrelated). No Sham Cash guide/PDF was ever uploaded. |
| Previous sessions | The only Sham Cash material is `/root/SHAMCASH_PLAN.md` (2026-09-04, DABIRNI project) and `/root/defense-app-plans/awtar-shamcash-manual.md` — both describe **manual wallet transfer + human admin confirmation**, and the DABIRNI plan states explicitly: API integration is *“مشروط بتوفير بيانات التاجر من قبلكم”*. |
| `/tmp/shamcash_content` | A **decompiled Flutter consumer app** (reverse-engineered APK: `flutter_assets/`, `kotlin/`, `mlkit_barcode_models/`). Reverse-engineered consumer-app endpoints are explicitly **not** an acceptable basis for the merchant integration. |

## 2. Missing items (hard requirements before any code)

**A. Official contract documents**
1. Official Sham Cash **merchant** API documentation (PDF/portal link) — not a third-party wrapper.
2. Official **base URL** of the merchant API (environment-dependent: sandbox vs production).
3. Official **authentication mechanism** (exact header name/format, token acquisition, expiry/refresh, or signature scheme).
4. Official list of **endpoints** used for: create payment / query status / verify transaction.
5. Official **request schema**: required fields, types, formats (amount minor-units? reference format? merchant id?), and examples.
6. Official **response schema**: success envelope, error envelope, status codes/messages, examples.
7. Official **status list** and their meanings (so they can be mapped to our `PENDING/PROCESSING/SUCCEEDED/FAILED/CANCELLED`).
8. Official **currency support** rules (which currencies are accepted; whether minor units or decimals are used).
9. Official **idempotency** semantics (does the API accept a client reference that guarantees a single transaction?).
10. Official **webhook/callback** specification *if it exists*: URL registration, payload schema, **signature/verification method**, retry policy, event id guarantee.

**B. Credentials / environment**
11. Merchant account + API key(s) / secret(s) delivered through a secure channel (never in code, never in Git).
12. Confirmation of which environment to integrate first (sandbox vs production).
13. A **public HTTPS URL** for webhooks if the contract uses callbacks (the current deployment has none configured).
14. Written approval of the **inventory/order boundary on payment success**: Stage 7 deliberately left “reservation → final SALE” undefined, and the Stage 8 brief forbids inventing it.

## 3. What was NOT done (and why)

- No `ShamCashProvider` implementation was written (would require inventing endpoints, auth, schemas).
- No provider was registered: `PAYMENT_PROVIDER_REGISTRY` still resolves to `[]` in `src/payments/payments.module.ts`.
- No new environment variables were added (only variables the official contract actually requires may be added).
- No webhook endpoint, signature algorithm or fake success path was created.
- No external HTTP client was added, so no request to any provider can happen.
- No credentials were added anywhere; no secret-scan hits (`SHAMCASH_API_KEY`, `X-API-Key`, `PIN`: 0 occurrences).

## 4. Where the integration plugs in (Stage 7 seams, unchanged)

- Interface to implement: `src/payments/interfaces/payment-provider.interface.ts`
  (`PaymentProvider` with `name`, `methods`, `createPayment`, `verifyPayment` + `ProviderPaymentRequest/Result`).
- Registration point (one line): `src/payments/payments.module.ts` → `{ provide: PAYMENT_PROVIDER_REGISTRY, useValue: [] }`.
- Resolution mechanism (already built): `src/payments/providers/payment-provider.registry.ts` (`hasProvider` / `resolve`, throws `NotImplementedException` when nothing is registered).
- Domain transitions already enforced: `src/payments/payments.service.ts` → `transition()` (row-locked, strict state machine; only place a status may change).
- Existing idempotency infrastructure for provider events: `idempotency_keys` (unique `userId+scope+key`) — a provider-event table can follow the same pattern if the official contract provides event ids.
- Audit: `AuditService` with `source: PROVIDER` already supported by `transition()`.

## 5. Deliverable once the contract arrives

1. `ShamCashProvider` implementing the existing interface (contract-only endpoints/fields).
2. `ShamCashStatusMapper` (provider statuses → internal states; unknown ⇒ PROCESSING, never SUCCEEDED).
3. Dedicated HTTP client with configurable timeout + typed errors + secret redaction (no blind retries on payment creation).
4. Registry: `SHAM_CASH → ShamCashProvider`.
5. Webhook endpoint *only if documented*, authenticated by the documented mechanism, idempotent by event id, with amount/currency/reference verification.
6. Contract tests based on official fixtures + e2e with a test-only fake provider (never registered in production).
