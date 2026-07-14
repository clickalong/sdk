/**
 * @clickalong/sdk — typed loader for the Clickalong support widget.
 *
 * Usage (any SPA / Remix / Next / plain JS):
 *
 *   import * as Clickalong from "@clickalong/sdk";
 *   Clickalong.init({ key: "pk_…" });
 *   Clickalong.identify({ email, userHash });          // userHash from your server
 *   Clickalong.set({ plan: "growth", credits: 1200 }); // safe to call every page load
 *   Clickalong.reset();                                 // logout / account switch
 *   Clickalong.open();                                  // open support from your own UI
 *
 * Every method is safe to call before widget.js finishes loading: calls are
 * queued as ["method", ...args] on window.Clickalong.q and replayed by the
 * widget at boot. All methods are SSR no-ops (window guard).
 */

export interface IdentifyPayload {
  email?: string;
  name?: string;
  /** Shown in the inbox visitor panel. Values: string | number | boolean. */
  attributes?: Record<string, string | number | boolean>;
  /**
   * HMAC-SHA256 hex of lowercase(email) keyed with your workspace identity
   * secret — computed on YOUR server. Marks the visitor "Verified".
   */
  userHash?: string;
}

export interface TourStep {
  selector: string;
  /** Ordered recovery locators used only when the primary selector no longer resolves uniquely. */
  fallbackLocators?: Array<
    | { kind: "css"; selector: string }
    | { kind: "role"; role: string; name: string }
    | { kind: "text"; tag: string; text: string }
  >;
  title?: string;
  description?: string;
  annotation?: string;
  advanceOn?: "click" | "manual";
  /** Present on server-delivered tours when a private target crop is available. */
  screenshot?: { width: number; height: number };
}

export interface TourStart {
  kind: "same-origin" | "shopify-app";
  pathname: string;
}

interface TourBase {
  name?: string;
  /** Server snapshot used only by Clickalong-delivered private screenshots. */
  version?: number;
  steps: TourStep[];
}

/** A route-spanning tour needs a stable id so it can resume safely after navigation. */
export type Tour =
  | (TourBase & { id: string; start: TourStart })
  | (TourBase & { id?: string; start?: undefined });

export interface InitOptions {
  /** Workspace widget key (pk_…) from Dashboard → Install. */
  key: string;
  /** Origin serving widget.js. Defaults to the Clickalong cloud. */
  origin?: string;
}

interface ClickalongStub {
  q?: unknown[][];
  [method: string]: unknown;
}

const DEFAULT_ORIGIN = "https://clickalong.ai";

function stub(): ClickalongStub {
  const w = window as unknown as { Clickalong?: ClickalongStub };
  if (!w.Clickalong) w.Clickalong = {};
  return w.Clickalong;
}

/**
 * The HTML snippet and the npm SDK are two installation paths for the same
 * singleton widget. Treat either script as authoritative so accidentally
 * rendering an SDK component twice (React Strict Mode) — or combining it with
 * a server-rendered raw tag — can never mount two widgets.
 */
function installedScript(): HTMLScriptElement | null {
  for (const script of Array.from(document.scripts)) {
    if (script.dataset.clickalong === "1" || script.dataset.clickalongSdk === "1") return script;
    if (!script.dataset.key || !script.src) continue;
    try {
      const url = new URL(script.src, document.baseURI);
      // Backward compatibility for the original production HTML snippet,
      // without suppressing an unrelated vendor's own /widget.js script.
      if (url.origin === DEFAULT_ORIGIN && url.pathname === "/widget.js") {
        return script;
      }
    } catch {
      // Ignore malformed unrelated script URLs and keep looking.
    }
  }
  return null;
}

/** Invoke now when the widget is live, otherwise queue for boot replay. */
function call(method: string, ...args: unknown[]): void {
  if (typeof window === "undefined") return;
  const api = stub();
  const fn = api[method];
  if (typeof fn === "function") {
    (fn as (...a: unknown[]) => void)(...args);
    return;
  }
  (api.q = api.q ?? []).push([method, ...args]);
}

/**
 * Injects the widget script once. Idempotent: repeat calls (client-side
 * navigations, React strict mode) are no-ops, as is any call during SSR.
 */
export function init(options: InitOptions): void {
  if (typeof window === "undefined" || !options?.key) return;
  stub(); // the queue must exist before the script evaluates
  if (installedScript()) return;
  const s = document.createElement("script");
  const origin = options.origin?.trim() || DEFAULT_ORIGIN;
  s.src = `${origin.replace(/\/+$/, "")}/widget.js`;
  s.async = true;
  s.dataset.key = options.key;
  s.dataset.clickalong = "1";
  s.dataset.clickalongSdk = "1";
  document.head.appendChild(s);
}

/** Attach identity (email/name) and optional verified userHash. */
export function identify(data: IdentifyPayload): void {
  call("identify", data);
}

/**
 * End the current browser visitor session before logout or an account switch.
 * This synchronously clears the previous transcript, identity, and attributes.
 */
export function reset(): void {
  call("reset");
}

/**
 * Update app-state attributes only (plan, credits, shop_domain, products, …).
 * Deduped by the widget, so calling on every page load is fine.
 */
export function set(attributes: Record<string, string | number | boolean>): void {
  call("set", attributes);
}

/** Open the support panel from a host-app help link or button. */
export function open(): void {
  call("open");
}

/** Launch a guided tour from your own UI (onboarding checklist, help menu). */
export function startTour(tour: Tour): void {
  call("startTour", tour);
}

export function endTour(): void {
  call("endTour");
}
