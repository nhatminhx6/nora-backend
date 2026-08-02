# Nora Backend

## Development authentication

The local `.env` issues access tokens for 60 days and refresh tokens for 90 days.
Existing tokens keep their original embedded expiration, so restart the API and
sign in again after changing these values.

TODO(production): Restore a short access-token lifetime and rotate authentication
secrets before production deployment.

## Development-only APIs

`DELETE /v1/users/account` deletes an account using its registered email without authentication. It exists only to support local development and returns `404 ROUTE_NOT_FOUND` when `NODE_ENV=production`.

> **TODO before production deployment:** Remove the public email-based account deletion endpoint and replace it with an authenticated, ownership-verified deletion flow.
