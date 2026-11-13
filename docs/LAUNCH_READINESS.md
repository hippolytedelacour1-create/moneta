# Moneta — launch readiness (2026-11-13)

## Status: NOT READY FOR REAL CUSTOMERS

This is an operational handoff, not a claim of end-to-end billing validation.

### Confirmed and implemented
- Live Stripe account `acct_1Ub5NX4niWBMfiPA`; recurring monthly 4.99 EUR price `price_1UbI4J4niWBMfiPA3WbBGF2i` (active, inclusive tax behavior). **Stripe Tax has not been configured or verified.**
- Live customer portal configuration `bpc_1UbHmI4niWBMfiPA9diCq9Wp` supports cancellation at period end, payment updates, and invoice history.
- Live webhook endpoint `we_1UbIEV4niWBMfiPAiFYXNldK` exists but remains **DISABLED**.
- Separate RLS-enabled, service-role-only tables: `moneta_live_billing_accounts`, `moneta_live_billing_subscriptions`, `moneta_live_billing_events`.
- Atomic `moneta_apply_live_billing_event` RPC: owner check, event deduplication and live subscription updates; granted only to service_role.
- Live Edge Function `moneta-billing-live` v2 deployed with server-side JWT verification, signed Stripe webhook verification, canonical subscription read, and customer portal.
- Live checkout protected by server-side environment variable `MONETA_LIVE_CHECKOUT_ENABLED` (only literal value `true` allows it); no public link is enabled.
- Front-end `billingMode` remains explicitly `test`; public signup/password reset remain closed.
- Unit and mock browser tests run via GitHub workflows. New live webhook tests cover signature, price, ownership and payment failure.
- Existing test payment endpoint `moneta-billing` remains isolated and unchanged.

### Required before first live charge
1. Verify configured Supabase Edge secrets are valid and accessible to the deployed Live function (not just named in settings). Never log secret values.
2. Exercise Live function `/health`, `/status`, unauthorized `/checkout` and unsigned `/webhook` over real HTTPS. Do not infer runtime health from deployment status.
3. Verify production Checkout Session creation only after administrative approval; use a controlled, authorized test of a real payment before opening public signup.
4. Enable and test the signed Stripe **Live** webhook, then verify entitlement on paid renewal, failed renewal, cancellation at period end, and repeated/out-of-order events. No access may be granted on an unverified return URL.
5. Complete French publisher/legal mentions, privacy policy, GDPR rights, billing/refund conditions, business postal address, company identifiers, and consumer cancellation/withdrawal information as applicable; have a qualified professional validate compliance.
6. Validate VAT/invoicing position (France + EU B2C services) and whether Stripe Tax or another invoicing/tax workflow is needed.
7. Verify email delivery, confirmation, password resets, abuse protection and turn on Supabase leaked-password protection.
8. Validate customer support and data export/delete flows; check subscription termination after account deletion.
9. Execute local browser tests and inspect the latest GitHub **both** workflows and Netlify deployment; verify deployed URLs and return-navigation behavior.
10. When ready: switch client config to `billingMode:'live'`, enable verified checkout flag, activate webhook, open signup, and record launch approval. Do not execute these toggles before completing checks 1–9.

### Important known limitations
- Webhook delivery can't be exercised while the Stripe Live destination is disabled.
- No real paid checkout has been performed (deliberate).
- Supabase security advisor currently warns leaked-password protection is disabled.
- A successful source build/CI run does **not** prove the hosted site deployed or the real Checkout/webhook sequence works.

### Useful links
- GitHub: https://github.com/hippolytedelacour1-create/moneta/actions
- Supabase: https://supabase.com/dashboard/project/ypdvqatkqzvzyrggiseh
- Stripe: https://dashboard.stripe.com
- Netlify app: https://inquisitive-sable-0a6180.netlify.app/app/
