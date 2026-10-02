# Geo & Location Privacy

SignalKit uses location **only with explicit consent** and only at **country/region granularity**. It never requires or stores precise GPS coordinates.

## What is stored

| Field (on `UserSettings`) | Meaning | When set |
| --- | --- | --- |
| `geoConsentStatus` | `unknown` \| `granted` \| `denied` \| `revoked` | When the user grants/declines/revokes |
| `locationUsageMode` | `off` \| `country_only` \| `region_only` | Only `country_only`/`region_only` when granted; forced `off` otherwise |
| `detectedCountry` | ISO 3166-1 alpha-2 (e.g. `TR`) | Only when consent is `granted` |
| `detectedRegion` | ISO 3166-2 (e.g. `DE-BY`) | Only when consent is `granted` **and** mode is `region_only` |
| `countryOfResidence` | ISO 3166-1 alpha-2 | Manually set by the user; independent of consent |

## What is never stored

- Precise latitude/longitude or any coordinate.
- Street address, postal code, or anything below region level.
- IP addresses are not persisted as part of geo (a request header may be read transiently to *suggest* a country via `GET /geo/detect`, but the result is not stored unless the user grants consent).

## Why

Market opportunity discovery only needs the **market** (country/region) and its language/regulatory context — not the user's physical position. Country/region granularity is sufficient for every scope:

`current_location` · `country_of_residence` · `manual_country` · `manual_region` · `multi_country` · `global`.

## How consent works

1. The user explicitly enables "Current location permission" in **Settings → Language & Region**.
2. The client obtains a coarse country (via `GET /geo/detect`, a header-based hint — no coordinates) and calls `PUT /me/geo-consent` with `status: granted`, a `locationUsageMode`, and at most a country/region.
3. `current_location` market discovery is **refused** (HTTP 403, `location_consent_required`) unless consent is granted, usage is enabled, and a country is known. This is enforced server-side in `resolveMarketProfile` (`@signalkit/shared`) and covered by tests.

## How to refuse or delete

- **Refuse**: simply never grant consent. All other scopes (manual country/region, multi-market, global) work without any location data.
- **Revoke / delete**: "Clear location data" calls `DELETE /me/location`, which sets `geoConsentStatus = revoked`, `locationUsageMode = off`, and nulls `detectedCountry`/`detectedRegion` immediately.

## Defaults

A new user starts with `geoConsentStatus = unknown`, `locationUsageMode = off`, and no detected location. The default market scope for discovery is **global** — no location required.
