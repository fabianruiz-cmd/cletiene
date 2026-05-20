## Packages
date-fns | Date formatting and manipulation for the UI

## Notes
- Ensure `@shared/schema` exports `createServiceSchema` and `@shared/routes` exports the `api` routing object.
- The logo is loaded dynamically from the provided URL.
- The `useSearchServices` hook relies on the `POST /api/services/search` endpoint expecting a `{ subject }` body.
- The `useBusinessUnits` hook relies on the `GET /api/business-units` endpoint returning `{ businessUnits: [...] }`.
