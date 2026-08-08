# Nora repository instructions

## Postman collection

- Keep exactly one importable file at `postman/Nora.postman_collection.json`.
- Do not create a separate Postman environment file unless the user explicitly requests one.
- Collection variables must be exactly `host` and `token`.
- Every JWT-protected request must contain a visible request-level header:
  `Authorization: Bearer {{token}}`.
- Do not rely on inherited collection or folder authorization because it is hidden in the request Headers UI.
- Public requests must not contain an Authorization header.
- Login and token refresh scripts must update the collection-level `token` variable.
- Run `npm run test:postman` after every API or Postman collection change.

