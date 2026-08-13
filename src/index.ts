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
 *   Clickalong.registerActions(actions);                // optional, confirmed host writes
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

/** Persisted effects supported by the first version of host actions. */
export type ActionEffect = "create" | "update" | "send";

export type ActionParameterType = "string" | "number" | "boolean" | "enum";

interface ActionParameterBase {
  name: string;
  description: string;
  required: boolean;
}

export type ActionParameter =
  | (ActionParameterBase & {
      type: "enum";
      options: string[];
    })
  | (ActionParameterBase & {
      type: Exclude<ActionParameterType, "enum">;
      options?: never;
    });

export interface ActionContext {
  /** Stable for this attempt. Use it as the idempotency key in the host backend. */
  operationId: string;
  /** Aborted when the visitor stops the task or the action times out. */
  signal: AbortSignal;
}

export type ActionResult =
  | { status: "completed"; summary: string }
  | { status: "rejected" | "failed"; message: string };

export interface ClickalongAction {
  id: string;
  title: string;
  description: string;
  effect: ActionEffect;
  parameters: ActionParameter[];
  execute(
    input: Record<string, string | number | boolean>,
    context: ActionContext,
  ): Promise<ActionResult>;
}

/** Explicit aliases for consumers that prefer names scoped to Clickalong. */
export type ClickalongActionParameter = ActionParameter;
export type ClickalongActionContext = ActionContext;
export type ClickalongActionResult = ActionResult;

interface ClickalongStub {
  q?: unknown[][];
  [method: string]: unknown;
}

const DEFAULT_ORIGIN = "https://clickalong.ai";
const MAX_ACTIONS = 20;
const MAX_PARAMETERS = 12;
const MAX_ENUM_OPTIONS = 50;
const MAX_MANIFEST_BYTES = 12_288;
const ACTION_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;
const PARAMETER_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ACTION_KEYS = new Set([
  "id",
  "title",
  "description",
  "effect",
  "parameters",
  "execute",
]);
const PARAMETER_KEYS = new Set([
  "name",
  "type",
  "description",
  "required",
  "options",
]);

// Metadata is normalized into words before these expressions run, so the
// checks also catch identifiers such as deleteWorkspace and upload_file.
// Registered actions are EXECUTE surface (real callbacks), so the manifest
// screen below always applies BOTH lists — the always/money split exists
// only to stay in lockstep with the server and widget mirrors, where guide-
// mode pointing relaxes to the always list (founder policy 2026-08-11:
// "guidance yes, robot no").
const ALWAYS_PROHIBITED_METADATA = [
  /\bdelet(?:e|es|ed|ing|ion|ions)\b/,
  /\bdestroy(?:s|ed|ing)?\b/,
  /\beras(?:e|es|ed|ing|ure|ures)\b/,
  /\bremov(?:e|es|ed|ing|al|als)\b/,
  /\barchiv(?:e|es|ed|ing)\b/,
  /\bdeactivat(?:e|es|ed|ing|ion|ions)\b/,
  /\bterminat(?:e|es|ed|ing|ion|ions)\b/,
  /\bpurg(?:e|es|ed|ing)\b/,
  /\brevok(?:e|es|ed|ing|ation|ations)\b/,
  /\bclos(?:e|es|ed|ing) (?:accounts?|workspaces?)\b/,
  /\bsuspend(?:s|ed|ing)? (?:accounts?|users?|workspaces?)\b/,
  /\bdisabl(?:e|es|ed|ing) (?:accounts?|users?|workspaces?)\b/,
  /\bban(?:s|ned|ning)? (?:accounts?|users?)\b/,
  /\block(?:s|ed|ing)? (?:accounts?|users?)\b/,
  /\b(?:wipe|wipes|wiped|wiping)\b/,
  /\bclear(?:s|ed|ing)? (?:all )?(?:(?:account|workspace|organization|organisation|project|database|table|user|customer) )?(?:data|records?|history|content)\b/,
  /\bdrop(?:s|ped|ping)? (?:databases?|tables?|data|records?|accounts?|workspaces?|organizations?|organisations?|projects?)\b/,
  /\btruncat(?:e|es|ed|ing|ion)\b/,
  /\b(?:factory )?reset(?:s|ting)? (?:accounts?|workspaces?|organizations?|organisations?|projects?|databases?|data|records?)\b/,
  /\b(?:promot(?:e|es|ed|ing|ion)|demot(?:e|es|ed|ing|ion)|elevat(?:e|es|ed|ing|ion)) (?:users?|members?|accounts?)\b/,
  /\b(?:users?|members?|accounts?) (?:promot(?:e|es|ed|ing|ion)|demot(?:e|es|ed|ing|ion)|elevat(?:e|es|ed|ing|ion))\b/,
  /\b(?:roles?|owners?|ownership|admins?|administrators?|access(?: levels?| tiers?)?|rights|membership levels?)\b/,
  /\b(?:make|set|assign|promote|elevate)(?: [a-z0-9]+){0,6} (?:admins?|administrators?|owners?)\b/,
  /\b(?:change|update|set|edit|assign|manage)(?: [a-z0-9]+){0,4} (?:roles?|access|rights?|ownership)\b/,
  /\b(?:grant|give|add|restrict|change|manage|update|set|edit)(?: [a-z0-9]+){0,5} (?:access|rights?|ownership)\b/,
  /\btransfer(?:s|red|ring)?(?: [a-z0-9]+){0,4} ownership\b/,
  /\b(?:credit|debit|payment) cards?\b/,
  /\bcard numbers?\b/,
  /\bcvvs?\b/,
  /\b(?:transfer(?:s|red|ring)?|send(?:s|ing)?|sent|mov(?:e|es|ed|ing)|wir(?:e|es|ed|ing)) (?:funds?|money|balance|cash)\b/,
  /\bwire transfers?\b/,
  /\b(?:withdraw(?:s|al|als|ing)?|withdrew|withdrawn)\b/,
  /\bdeposit(?:s|ed|ing)?\b/,
  /\bpermissions?\b/,
  /\bprivileges?\b/,
  /\bsecurity\b/,
  /\bsecurity answers?\b/,
  /\b(?:auth|authentication|two factor|multi factor|2fa|mfa)\b/,
  /\bauthori[sz](?:e|es|ed|ing|ation)\b/,
  /\brecovery codes?\b/,
  /\b(?:log|sign) ?(?:in|out)\b/,
  /\bcredentials?\b/,
  /\bpasswords?\b/,
  /\bpasscodes?\b/,
  /\botps?\b/,
  /\bone time passwords?\b/,
  /\bsecrets?\b/,
  /\btokens?\b/,
  /\bapi keys?\b/,
  /\bfiles?\b/,
  /\bupload(?:s|ed|ing)?\b/,
  /\bdownload(?:s|ed|ing)?\b/,
  /\battachments?\b/,
  /\bcancel(?:s|led|ing)? accounts?\b/,
  /\birreversible\b/,
  /\barbitrary\b/,
  /\bscripts?\b/,
  /\bjavascript\b/,
  /\bcode executions?\b/,
  /\b(?:execut(?:e|es|ed|ing)|runs?|running) code\b/,
] as const;

const MONEY_GUIDANCE_METADATA = [
  /\b(?:upgrad(?:e|es|ed|ing)|downgrad(?:e|es|ed|ing)|renew(?:s|ed|ing|al|als)?)\b/,
  /\b(?:paid|pricing|price|pro|premium|enterprise) (?:plans?|tiers?|subscriptions?)\b/,
  /\bbilling\b/,
  /\binvoices?\b/,
  /\bpayments?\b/,
  /\bcharg(?:e|es|ed|ing)\b/,
  /\bpurchas(?:e|es|ed|ing)\b/,
  /\bbuy(?:s|ing)?\b/,
  /\bcheck ?outs?\b/,
  /\b(?:pay(?:s|ing)?|paid)\b/,
  // Deliberately phrase-scoped: bare "order"/"orders" is the name of an
  // ordinary nav section in every commerce app, and blocking it would refuse
  // legitimate navigation. Only the commit verbs are prohibited.
  /\b(?:plac(?:e|es|ed|ing)|submit(?:s|ted|ting)?|complet(?:e|es|ed|ing)|confirm(?:s|ed|ing)?|cancel(?:s|l?ed|l?ing)?|commit(?:s|ted|ting)?|finali[sz](?:e|es|ed|ing)) (?:the |your |my )?orders?\b/,
  /\b(?:un)?subscri(?:ptions?|bes?|bed|bing)\b/,
  /\brefund(?:s|ed|ing)?\b/,
] as const;

const PROHIBITED_METADATA = [
  ...ALWAYS_PROHIBITED_METADATA,
  ...MONEY_GUIDANCE_METADATA,
] as const;

type ActionManifestEntry = Omit<ClickalongAction, "execute">;

function invalid(path: string, reason: string): never {
  throw new TypeError(`Invalid Clickalong action registry: ${path} ${reason}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPlainArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype;
}

function dataArraySnapshot(
  value: unknown,
  path: string,
  maximum: number,
): unknown[] {
  if (!isPlainArray(value)) invalid(path, "must be an array");
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !lengthDescriptor ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    invalid(`${path}.length`, "must be a plain array length");
  }
  const length = lengthDescriptor.value as number;
  if (length > maximum) {
    invalid(path, `cannot contain more than ${maximum} items`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    const index = typeof key === "string" ? Number(key) : Number.NaN;
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= length ||
      String(index) !== key
    ) {
      invalid(`${path}.${String(key)}`, "is not supported");
    }
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) {
      invalid(`${path}[${index}]`, "must be a plain array item");
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

function dataObjectSnapshot(
  value: unknown,
  allowed: Set<string>,
  path: string,
): Record<string, unknown> {
  if (!isPlainObject(value)) invalid(path, "must be a plain object");
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      invalid(`${path}.${String(key)}`, "is not supported");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      invalid(`${path}.${key}`, "must be a plain data property");
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function boundedText(
  value: unknown,
  path: string,
  maximum: number,
): string {
  if (typeof value !== "string") invalid(path, "must be a string");
  const sanitized = value.trim();
  if (sanitized.length === 0 || sanitized.length > maximum) {
    invalid(path, `must contain 1 to ${maximum} characters after trimming`);
  }
  return sanitized;
}

function normalizedMetadata(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z\d]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Block homoglyph-spliced words without rejecting fully localized metadata. */
function hasMixedLatinCyrillicWord(value: string): boolean {
  const folded = value.normalize("NFKD").replace(/\p{M}+/gu, "");
  return (folded.match(/\p{L}+/gu) ?? []).some((word) =>
    /\p{Script_Extensions=Latin}/u.test(word) &&
    /\p{Script_Extensions=Cyrillic}/u.test(word)
  );
}

function assertAllowedMetadata(value: string, path: string): void {
  if (hasMixedLatinCyrillicWord(value)) {
    invalid(path, "contains mixed Latin and Cyrillic letters in one word");
  }
  const normalized = normalizedMetadata(value);
  if (PROHIBITED_METADATA.some((pattern) => pattern.test(normalized))) {
    invalid(path, "describes a prohibited action category");
  }
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function jsonString(value: string): string {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string") {
    invalid("actions", "manifest metadata could not be serialized");
  }
  return serialized;
}

/** Serialize only constructed primitives, bypassing inherited toJSON hooks. */
function serializedManifest(manifest: ActionManifestEntry[]): string {
  const actions = manifest.map((action) => {
    const parameters = action.parameters.map((parameter) => {
      const options = parameter.type === "enum"
        ? `,"options":[${parameter.options.map(jsonString).join(",")}]`
        : "";
      return `{"name":${jsonString(parameter.name)},"type":${jsonString(parameter.type)},"description":${jsonString(parameter.description)},"required":${parameter.required ? "true" : "false"}${options}}`;
    });
    return `{"id":${jsonString(action.id)},"title":${jsonString(action.title)},"description":${jsonString(action.description)},"effect":${jsonString(action.effect)},"parameters":[${parameters.join(",")}]}`;
  });
  return `[${actions.join(",")}]`;
}

/**
 * Validate and snapshot the entire replacement before exposing any part of it
 * to the widget. This preserves atomic registration even if the caller later
 * mutates its source array or metadata objects.
 */
function validateActions(value: unknown): ClickalongAction[] {
  const actions = dataArraySnapshot(value, "actions", MAX_ACTIONS);

  const actionIds = new Set<string>();
  const manifest: ActionManifestEntry[] = [];
  const snapshot: ClickalongAction[] = [];

  for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    const actionPath = `actions[${actionIndex}]`;
    const rawAction = dataObjectSnapshot(
      actions[actionIndex],
      ACTION_KEYS,
      actionPath,
    );

    if (typeof rawAction.id !== "string" || !ACTION_ID.test(rawAction.id)) {
      invalid(
        `${actionPath}.id`,
        "must match /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/",
      );
    }
    if (actionIds.has(rawAction.id)) {
      invalid(`${actionPath}.id`, `duplicates action id ${JSON.stringify(rawAction.id)}`);
    }
    actionIds.add(rawAction.id);

    const title = boundedText(rawAction.title, `${actionPath}.title`, 100);
    const description = boundedText(
      rawAction.description,
      `${actionPath}.description`,
      500,
    );
    assertAllowedMetadata(rawAction.id, `${actionPath}.id`);
    assertAllowedMetadata(title, `${actionPath}.title`);
    assertAllowedMetadata(description, `${actionPath}.description`);

    const effect = rawAction.effect;
    if (effect !== "create" && effect !== "update" && effect !== "send") {
      invalid(`${actionPath}.effect`, "must be create, update, or send");
    }
    const rawParameters = dataArraySnapshot(
      rawAction.parameters,
      `${actionPath}.parameters`,
      MAX_PARAMETERS,
    );
    if (typeof rawAction.execute !== "function") {
      invalid(`${actionPath}.execute`, "must be a function");
    }

    const parameterNames = new Set<string>();
    const parameters: ActionParameter[] = [];
    for (
      let parameterIndex = 0;
      parameterIndex < rawParameters.length;
      parameterIndex += 1
    ) {
      const parameterPath = `${actionPath}.parameters[${parameterIndex}]`;
      const rawParameter = dataObjectSnapshot(
        rawParameters[parameterIndex],
        PARAMETER_KEYS,
        parameterPath,
      );

      if (
        typeof rawParameter.name !== "string" ||
        !PARAMETER_NAME.test(rawParameter.name)
      ) {
        invalid(
          `${parameterPath}.name`,
          "must match /^[A-Za-z][A-Za-z0-9_]{0,63}$/",
        );
      }
      if (parameterNames.has(rawParameter.name)) {
        invalid(
          `${parameterPath}.name`,
          `duplicates parameter name ${JSON.stringify(rawParameter.name)}`,
        );
      }
      parameterNames.add(rawParameter.name);

      const parameterDescription = boundedText(
        rawParameter.description,
        `${parameterPath}.description`,
        300,
      );
      assertAllowedMetadata(rawParameter.name, `${parameterPath}.name`);
      assertAllowedMetadata(
        parameterDescription,
        `${parameterPath}.description`,
      );

      const parameterType = rawParameter.type;
      if (
        parameterType !== "string" &&
        parameterType !== "number" &&
        parameterType !== "boolean" &&
        parameterType !== "enum"
      ) {
        invalid(
          `${parameterPath}.type`,
          "must be string, number, boolean, or enum",
        );
      }
      if (typeof rawParameter.required !== "boolean") {
        invalid(`${parameterPath}.required`, "must be a boolean");
      }

      const parameterBase: ActionParameterBase = {
        name: rawParameter.name,
        description: parameterDescription,
        required: rawParameter.required,
      };
      if (parameterType === "enum") {
        const rawOptions = dataArraySnapshot(
          rawParameter.options,
          `${parameterPath}.options`,
          MAX_ENUM_OPTIONS,
        );
        if (
          rawOptions.length === 0
        ) {
          invalid(
            `${parameterPath}.options`,
            `must contain 1 to ${MAX_ENUM_OPTIONS} options`,
          );
        }
        const optionSet = new Set<string>();
        const options = rawOptions.map((rawOption, optionIndex) => {
          const optionPath = `${parameterPath}.options[${optionIndex}]`;
          const option = boundedText(rawOption, optionPath, 100);
          if (optionSet.has(option)) invalid(optionPath, "must be unique");
          optionSet.add(option);
          assertAllowedMetadata(option, optionPath);
          return option;
        });
        parameters.push({ ...parameterBase, type: "enum", options });
      } else if (rawParameter.options !== undefined) {
        invalid(
          `${parameterPath}.options`,
          "is only supported for enum parameters",
        );
      } else {
        parameters.push({ ...parameterBase, type: parameterType });
      }
    }

    const manifestEntry: ActionManifestEntry = {
      id: rawAction.id,
      title,
      description,
      effect,
      parameters,
    };
    // Scan the assembled metadata too: a prohibited phrase split across an
    // action and parameter (for example "transfer" + "ownership") must not
    // evade the per-field checks above.
    assertAllowedMetadata(
      [
        manifestEntry.id,
        manifestEntry.title,
        manifestEntry.description,
        ...manifestEntry.parameters.flatMap((parameter) => [
          parameter.name,
          parameter.description,
          ...(parameter.options ?? []),
        ]),
      ].join(" "),
      actionPath,
    );
    manifest.push(manifestEntry);
    snapshot.push({ ...manifestEntry, execute: rawAction.execute as ClickalongAction["execute"] });
  }

  if (utf8Bytes(serializedManifest(manifest)) > MAX_MANIFEST_BYTES) {
    invalid("actions", `manifest cannot exceed ${MAX_MANIFEST_BYTES} UTF-8 bytes`);
  }
  return snapshot;
}

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

/**
 * Atomically replace the optional host-action registry. Passing [] clears it.
 * Invalid browser registrations throw before anything is queued or dispatched;
 * like every SDK method, registration is a no-op during SSR.
 */
export function registerActions(actions: ClickalongAction[]): void {
  if (typeof window === "undefined") return;
  let snapshot: ClickalongAction[];
  try {
    snapshot = validateActions(actions);
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new TypeError("Invalid Clickalong action registry: actions could not be validated");
  }
  call("registerActions", snapshot);
}

/** Launch a guided tour from your own UI (onboarding checklist, help menu). */
export function startTour(tour: Tour): void {
  call("startTour", tour);
}

export function endTour(): void {
  call("endTour");
}
