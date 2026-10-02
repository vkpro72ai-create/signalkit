# Source Ingestion — Legal & Usage

SignalKit's value depends on **trustworthy sources**. The ingestion layer never fabricates data and respects source terms.

## Principles

- **No fake sources or evidence.** Every `RawSourceItem` is either content the user supplied (`manual`) or content actually fetched from a public URL/API. If an adapter can't get real data (missing key, fetch error), it records a **visible failure** — it never invents content.
- **No private-data scraping.** Adapters fetch only public pages or use official provider APIs under their terms. No authentication-walled content, no personal data harvesting.
- **User-provided data is labeled.** Manual sources set `userProvided = true` and are shown as such.
- **Coarse market context only.** Items carry country/region and language — never precise user location (see [PRIVACY_GEO.md](PRIVACY_GEO.md)).

## Per-adapter notes

| Adapter | Source | Requires key | Notes |
| --- | --- | --- | --- |
| `manual` | User upload | no | User-provided; no collection. |
| `url` | Public web page | no | Public pages only; `SignalKitBot` user-agent; respects site terms/robots. |
| `competitor_website` / `pricing_page` / `regulatory_page` | Public pages | no | Same as `url`, with a focused signal type. |
| `search_result` | Search provider API | yes (`SEARCH_API_KEY`) | Uses the provider API under its terms; does not scrape result pages. |
| `reddit` | Reddit API | yes (`REDDIT_API_TOKEN`) | Official API; public posts only. |
| `product_hunt` | Product Hunt API | yes (`PRODUCT_HUNT_TOKEN`) | Official API. |
| `app_store_review` | Public review feeds | yes (`APP_STORE_FEED_KEY`) | Aggregate reviews under platform terms. |

When a required key is absent, the adapter returns `configuration_needed` and the UI shows a clear "configuration needed" state. No placeholder/fake production data is ever written.

## robots & rate limits

- URL adapters send a descriptive bot user-agent and target ~1 request/second per host.
- API adapters honor each provider's published rate limits and terms.
- Operators are responsible for ensuring their configured providers and target sites permit this use in their jurisdiction.

## Data retention

Raw content is stored to support the Evidence Graph (claims must trace to a real source). Excluding a source marks its items `excluded` and removes derived signals. Deleting a project cascades its sources, items and signals.
