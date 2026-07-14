# @clickalong/sdk

[![npm version](https://img.shields.io/npm/v/@clickalong/sdk.svg)](https://www.npmjs.com/package/@clickalong/sdk)
[![CI](https://github.com/clickalong/sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/clickalong/sdk/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Typed, dependency-free JavaScript loader for the
[Clickalong](https://clickalong.ai) support widget. It injects `widget.js` once,
queues calls made before the widget is ready, and is safe under server-side
rendering and React Strict Mode.

Clickalong is a Profitonium Apps product. This repository contains the
open-source loader SDK; the hosted widget and the Clickalong service are
separate products.

## Install

```bash
npm install @clickalong/sdk
```

## Quick start

```ts
import * as Clickalong from "@clickalong/sdk";

Clickalong.init({ key: "pk_…" });

Clickalong.identify({
  email: "jane@example.com",
  name: "Jane",
});

Clickalong.set({
  plan: "pro",
  credits_remaining: 1200,
});
```

Find the public widget key in **Clickalong Dashboard → Install**.

## React example

```tsx
"use client";

import { useEffect, useRef } from "react";
import * as Clickalong from "@clickalong/sdk";

type Props = {
  email?: string;
  name?: string;
  attributes?: Record<string, string | number | boolean>;
};

export function ClickalongWidget({ email, name, attributes }: Props) {
  const previousEmail = useRef<string | null>(null);

  useEffect(() => {
    Clickalong.init({ key: "pk_…" });
  }, []);

  useEffect(() => {
    const nextEmail = email?.trim().toLowerCase() ?? null;
    if (previousEmail.current && previousEmail.current !== nextEmail) {
      Clickalong.reset();
    }
    previousEmail.current = nextEmail;
    if (nextEmail) Clickalong.identify({ email, name });
  }, [email, name]);

  useEffect(() => {
    if (attributes) Clickalong.set(attributes);
  }, [attributes]);

  return null;
}
```

Call `reset()` before logout or when the host application switches accounts.
It rotates the visitor session and clears the previous identity, attributes,
and transcript. The example preserves an anonymous pre-login conversation when
the first user signs in, while isolating later account changes.

## API

### `init(options)`

Loads the widget once. Repeated calls are safe.

```ts
Clickalong.init({
  key: "pk_…",
  // origin: "https://clickalong.ai", // optional; cloud origin is the default
});
```

### `identify(visitor)`

Associates the current browser visitor with identity information already known
by the host application.

```ts
Clickalong.identify({
  email: "jane@example.com",
  name: "Jane",
  attributes: { account_id: "acct_123" },
  userHash: "server-generated-hmac",
});
```

### `reset()`

Ends the current browser visitor session. Call it before logout or an account
switch so one customer's support history cannot appear for another customer.

### `set(attributes)`

Updates live application context shown to support operators. Values may be
strings, numbers, or booleans. Repeated calls are deduplicated by the widget.

### `open()`

Opens the support panel from a custom help button or menu.

### `startTour(tour)` and `endTour()`

Starts or stops a guided tour from host application UI.

```ts
Clickalong.startTour({
  name: "Create a project",
  steps: [
    {
      selector: "[data-new-project]",
      title: "Create a project",
      description: "Start here.",
      advanceOn: "click",
    },
  ],
});
```

Route-spanning tours also require a stable `id` and a `start` pathname. The
exported TypeScript types enforce that relationship.

Every API method is an SSR no-op. Calls made in the browser before `widget.js`
finishes loading are replayed in their original order.

## Verified identity

`userHash` is an HMAC-SHA256 of the visitor's normalized email, generated with
the workspace identity secret on your server:

```ts
import { createHmac } from "node:crypto";

const userHash = createHmac(
  "sha256",
  process.env.CLICKALONG_IDENTITY_SECRET!,
)
  .update(email.trim().toLowerCase())
  .digest("hex");
```

Never include the workspace identity secret in browser code, public
environment variables, or an API response.

## Compatibility

- ESM, CommonJS, and TypeScript declarations
- React, React Router, Remix, Next.js Client Components, Vue, Svelte, Vite,
  and other browser bundles
- ES2019 browser output
- Zero runtime dependencies
- Node.js 20 or newer for local development

For a restrictive Content Security Policy, allow `https://clickalong.ai` in
the host application's `script-src`, `connect-src`, and `img-src` directives.
The policy must also permit the widget's injected Shadow DOM styles. CSP rules
vary by application, so verify the widget under the production policy before
deployment.

## Development

```bash
npm ci
npm run verify
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report
security vulnerabilities according to [SECURITY.md](SECURITY.md), not in a
public issue.

## License

[MIT](LICENSE) © Profitonium Apps.
