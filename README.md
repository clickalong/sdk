# @clickalong/sdk

[![npm version](https://img.shields.io/npm/v/@clickalong/sdk.svg)](https://www.npmjs.com/package/@clickalong/sdk)
[![CI](https://github.com/clickalong/sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/clickalong/sdk/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Typed, dependency-free JavaScript loader for the
[Clickalong](https://clickalong.ai) support widget. It injects `widget.js` once,
queues calls made before the widget is ready, and is safe under server-side
rendering and React Strict Mode. It can also register explicitly bounded host
actions for visitor-confirmed in-app task execution.

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

### `registerActions(actions)`

Atomically replaces the optional host-action registry. Register at the
application root so callbacks remain available and the registry stays stable
across client-side navigation. Repeated registration is safe, including React
Strict Mode's repeated effects; pass `[]` to clear the registry.

Write execution is available only after `identify()` verifies the visitor with
a valid server-generated `userHash`. This is an additional Clickalong gate, not
a substitute for authorization in the host callback.

```tsx
import { useEffect } from "react";
import * as Clickalong from "@clickalong/sdk";
import type { ClickalongAction } from "@clickalong/sdk";

const actions: ClickalongAction[] = [
  {
    id: "createSavedView",
    title: "Create a saved view",
    description: "Save the current filters as a named view.",
    effect: "create",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "The saved-view name.",
        required: true,
      },
    ],
    async execute(input, { operationId, signal }) {
      if (typeof input.name !== "string" || input.name.trim() === "") {
        return { status: "rejected", message: "A saved-view name is required." };
      }

      const response = await fetch("/api/saved-views", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationId,
        },
        body: JSON.stringify({ name: input.name, operationId }),
        signal,
      });

      if (response.status === 401 || response.status === 403) {
        return { status: "rejected", message: "You cannot create saved views." };
      }
      if (!response.ok) {
        return { status: "failed", message: "The saved view was not confirmed." };
      }

      const result = (await response.json()) as { savedViewId?: string };
      if (!result.savedViewId) {
        return { status: "failed", message: "The backend did not confirm the saved view." };
      }
      return { status: "completed", summary: `Saved view ${result.savedViewId} created.` };
    },
  },
];

export function ClickalongRoot() {
  useEffect(() => {
    Clickalong.init({ key: "pk_…" });
    Clickalong.registerActions(actions);
    return () => Clickalong.registerActions([]);
  }, []);

  return null;
}
```

The callback runs in the host page. Only its sanitized manifest—identifier,
labels, effect, and primitive parameter schema—can reach Clickalong's backend;
the callback function does not. Treat every callback like any other mutation
endpoint: use the application's authenticated session, repeat authorization on
the server, validate every input, and keep CSRF protection in place. A verified
Clickalong visitor does not replace the host application's authorization.

Clickalong passes a stable `operationId` for the attempt and never
automatically retries a write. Forward it to the backend as an idempotency key
so an ambiguous network result cannot duplicate the mutation. The supplied
`AbortSignal` is aborted when the visitor stops the task or execution times
out; pass it to `fetch` and other abort-aware work. Aborting is best-effort and
does not undo a mutation that the backend already completed.

Return `completed` only after the backend has durably confirmed the mutation,
never after an optimistic UI update. Use `rejected` for an authorization or
business-rule refusal and `failed` for a technical failure. Do not catch an
abort and claim completion.

Registration is validated as one atomic replacement before it is queued or
dispatched. A registry may contain at most 20 uniquely identified actions, 12
unique primitive parameters per action, 50 unique values per enum, and a 12 KB
UTF-8 sanitized manifest. Action IDs must match
`^[A-Za-z][A-Za-z0-9._:-]{0,63}$`; titles contain 1–100 trimmed characters and
descriptions 1–500. Parameter names must match
`^[A-Za-z][A-Za-z0-9_]{0,63}$`, parameter descriptions contain 1–300 trimmed
characters, and names are unique within the action. Enum parameters require
1–50 unique options of 1–100 trimmed characters; `options` is rejected on
non-enum parameters.

Invalid registries throw `TypeError` and replace nothing. V1 supports only
`create`, `update`, and `send`; actions or parameter metadata involving
deletion/removal, billing/invoices/payments/refunds, money transfers/
withdrawals/deposits, purchases/checkout/order commitments, subscriptions,
permissions/privileges, security, credentials/passwords/
passcodes/OTP/secrets/tokens/API keys, files/uploads/downloads/attachments,
arbitrary scripts/code execution, or other irreversible work are rejected.

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
finishes loading are queued. At widget boot, the latest `registerActions` call
is applied before the remaining calls so callbacks are available when an
in-progress task resumes; all other calls retain their original order.

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
