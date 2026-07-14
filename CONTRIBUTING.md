# Contributing

Contributions to `@clickalong/sdk` are welcome.

## Development setup

Use Node.js 20 or newer, then run:

```bash
npm ci
npm run verify
```

## Pull requests

1. Keep changes focused on the loader SDK and its public API.
2. Add or update tests for behavior changes.
3. Preserve SSR safety, React Strict Mode idempotence, and the pre-load queue.
4. Do not add runtime dependencies without prior discussion.
5. Update the README and changelog when public behavior changes.
6. Confirm `npm run verify` passes before opening the pull request.

Maintainers own versioning and npm releases. Do not edit the package version in
an ordinary pull request unless a maintainer requests it.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
