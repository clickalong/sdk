# Changelog

All notable changes to `@clickalong/sdk` are documented here. The project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-08-13

- Added typed `registerActions()` support for visitor-confirmed host actions.
- Added atomic validation and immutable registration snapshots, including safe
  identifiers, bounded metadata and enums, registry and parameter limits, a
  12 KB UTF-8 manifest cap, and rejection of prohibited action categories.
- Preserved pre-load queuing, SSR no-op behavior, and React Strict Mode safety
  for action replacement and clearing.
- Documented application-root registration, authenticated callbacks,
  `operationId` idempotency, `AbortSignal` cancellation, no automatic retries,
  and truthful completion after backend confirmation.

## [0.1.2] - 2026-07-15

- Established this repository as the canonical public SDK source under MIT.
- Added GitHub Actions CI and npm trusted-publishing provenance support.
- Added complete npm repository, license, author, issue, and homepage metadata.
- Added conditional TypeScript declarations for ESM and CommonJS consumers.
- Included the TypeScript source in the npm package for source transparency.
- Documented the public API, React integration, identity isolation, and verified
  identity flow.
- Added tour API test coverage and package-manifest validation.

## [0.1.1 and 0.1.0] - 2026-07-14

These versions were published before the public source repository and
provenance workflow existed. Their immutable registry artifacts remain
available on npm; detailed public changelog history begins with `0.1.2`.

[0.2.0]: https://github.com/clickalong/sdk/releases/tag/v0.2.0
[0.1.2]: https://github.com/clickalong/sdk/releases/tag/v0.1.2
