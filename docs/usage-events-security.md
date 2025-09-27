# Usage Events Security & Retention

The new `usageEvents` collection is a cost-analytics feed and must be treated as privileged telemetry. This document captures the security posture and operational expectations for the dataset.

## Firestore Rules

1. **Writes limited to trusted code**
   ```javascript
   match /usageEvents/{eventId} {
     allow create: if request.auth != null && request.auth.token.admin == true;
     allow read: if request.auth != null && request.auth.token.admin == true;
     allow update, delete: if false;
   }
   ```
   - Production deployments should route writes through Cloud Functions (using Admin SDK) so only servers can add events. If that’s not feasible, decorate admin accounts with a custom claim `admin: true` and send events from authenticated clients.
   - Never allow anonymous or end-user writes; they could spoof consumption and poison reports.

2. **Read access**
   - Admin dashboard requires `admin` claim.
   - Designers/customers must not see raw events because they include internal prompt content, costs, and other customer IDs.

3. **Indexing**
   - Create composite indexes for the main filters:
     - `timestamp DESC` + `actionType`
     - `timestamp DESC` + `modelUsed`
     - `timestamp DESC` + `status`
     - `timestamp DESC` + `subscriptionTier`
     - `timestamp DESC` + `userId`
   - Add `timestamp DESC` single-field index for lookbacks.

## Retention & Export

- Retain raw events for **90 days**; roll up into daily summaries per user/tier and store separately.
- Add a scheduled Cloud Function to delete documents older than 90 days.
- If billing-grade analytics is required, stream events into BigQuery via Cloud Functions for long-term storage.

## Additional Recommendations

- Obfuscate or hash `userId` if you later export data to third-party systems.
- Cap event size (`extra` payload) to avoid exceeding Firestore document limits.
- Monitor collection growth; each event ~1 KB → ~86 MB per million events.
- Version the schema via `extra.schemaVersion` to allow future expansion without breaking dashboards.
- The logger now stores `estimatedCostUsd`; adjust pricing constants in `services/costEstimator.ts` if Google updates their rate card.

These controls keep usage telemetry isolated to trusted operators while still giving the admin dashboard access to the insights it needs.
