import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  endTour,
  identify,
  init,
  open,
  registerActions,
  reset,
  set,
  startTour,
  type ClickalongAction,
} from "../src/index";

interface TestApi {
  q?: unknown[][];
  identify?: (...args: unknown[]) => void;
  reset?: (...args: unknown[]) => void;
  set?: (...args: unknown[]) => void;
  open?: (...args: unknown[]) => void;
  registerActions?: (...args: unknown[]) => void;
  startTour?: (...args: unknown[]) => void;
  endTour?: (...args: unknown[]) => void;
}

function testWindow(): Window & { Clickalong?: TestApi } {
  return window as Window & { Clickalong?: TestApi };
}

function sdkScripts(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>("script[data-clickalong-sdk]"),
  );
}

function action(
  overrides: Partial<ClickalongAction> = {},
): ClickalongAction {
  return {
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
    execute: async () => ({ status: "completed", summary: "Saved view created." }),
    ...overrides,
  };
}

describe("@clickalong/sdk", () => {
  beforeEach(() => {
    for (const script of Array.from(document.scripts)) script.remove();
    delete testWindow().Clickalong;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("init", () => {
    it("injects the cloud widget with the workspace key", () => {
      init({ key: "pk_acme" });

      expect(sdkScripts()).toHaveLength(1);
      const script = sdkScripts()[0];
      expect(script.src).toBe("https://clickalong.ai/widget.js");
      expect(script.dataset.key).toBe("pk_acme");
      expect(script.dataset.clickalong).toBe("1");
      expect(script.dataset.clickalongSdk).toBe("1");
      expect(script.async).toBe(true);
      expect(testWindow().Clickalong).toEqual({});
    });

    it("uses a custom widget origin and normalizes trailing slashes", () => {
      init({ key: "pk_local", origin: "  https://support.example.test///  " });

      expect(sdkScripts()[0]?.src).toBe(
        "https://support.example.test/widget.js",
      );
    });

    it("is idempotent across React Strict Mode's repeated effect", () => {
      init({ key: "pk_first" });
      init({ key: "pk_first" });
      init({ key: "pk_second", origin: "https://wrong.example" });

      expect(sdkScripts()).toHaveLength(1);
      expect(sdkScripts()[0]?.dataset.key).toBe("pk_first");
      expect(sdkScripts()[0]?.src).toBe("https://clickalong.ai/widget.js");
    });

    it("does not duplicate a server-rendered raw HTML installation", () => {
      const raw = document.createElement("script");
      raw.src = "https://clickalong.ai/widget.js";
      raw.dataset.key = "pk_html";
      document.head.appendChild(raw);

      init({ key: "pk_sdk" });

      expect(document.scripts).toHaveLength(1);
      expect(sdkScripts()).toHaveLength(0);
      expect(testWindow().Clickalong).toEqual({});
    });

    it("does not mistake an unrelated vendor's widget.js for Clickalong", () => {
      const unrelated = document.createElement("script");
      unrelated.src = "https://other.example/widget.js";
      unrelated.dataset.key = "other-vendor";
      document.head.appendChild(unrelated);

      init({ key: "pk_sdk" });

      expect(document.scripts).toHaveLength(2);
      expect(sdkScripts()).toHaveLength(1);
      expect(sdkScripts()[0]?.dataset.key).toBe("pk_sdk");
    });

    it("does nothing for an empty key", () => {
      init({ key: "" });

      expect(document.scripts).toHaveLength(0);
      expect(testWindow().Clickalong).toBeUndefined();
    });
  });

  describe("pre-load queue", () => {
    it("keeps identify and set calls made before init in exact order", () => {
      const identity = { email: "jane@acme.test", name: "Jane" };
      const attributes = { plan: "growth", credits: 1200, verified: true };

      identify(identity);
      set(attributes);
      init({ key: "pk_acme" });

      expect(testWindow().Clickalong?.q).toEqual([
        ["identify", identity],
        ["set", attributes],
      ]);
      expect(sdkScripts()).toHaveLength(1);
    });

    it("appends to a host-created queue without replacing it", () => {
      testWindow().Clickalong = { q: [["open"]] };

      identify({ email: "jane@acme.test" });
      set({ products: 812 });

      expect(testWindow().Clickalong?.q).toEqual([
        ["open"],
        ["identify", { email: "jane@acme.test" }],
        ["set", { products: 812 }],
      ]);
    });

    it("queues open until widget.js is ready", () => {
      open();
      expect(testWindow().Clickalong?.q).toEqual([["open"]]);
    });

    it("queues reset before the widget is ready", () => {
      reset();
      expect(testWindow().Clickalong?.q).toEqual([["reset"]]);
    });

    it("queues tour controls before the widget is ready", () => {
      const tour = {
        name: "Create a project",
        steps: [{ selector: "[data-new-project]", title: "Create a project" }],
      };

      startTour(tour);
      endTour();

      expect(testWindow().Clickalong?.q).toEqual([
        ["startTour", tour],
        ["endTour"],
      ]);
    });
  });

  describe("live API dispatch", () => {
    it("calls live identify and set methods instead of queueing", () => {
      const liveIdentify = vi.fn();
      const liveSet = vi.fn();
      testWindow().Clickalong = { identify: liveIdentify, set: liveSet };

      identify({ email: "jane@acme.test" });
      set({ plan: "growth" });

      expect(liveIdentify).toHaveBeenCalledOnce();
      expect(liveIdentify).toHaveBeenCalledWith({ email: "jane@acme.test" });
      expect(liveSet).toHaveBeenCalledOnce();
      expect(liveSet).toHaveBeenCalledWith({ plan: "growth" });
      expect(testWindow().Clickalong?.q).toBeUndefined();
    });

    it("can dispatch one live method while queueing another", () => {
      const liveIdentify = vi.fn();
      testWindow().Clickalong = { identify: liveIdentify };

      identify({ name: "Jane" });
      set({ plan: "growth" });

      expect(liveIdentify).toHaveBeenCalledWith({ name: "Jane" });
      expect(testWindow().Clickalong?.q).toEqual([["set", { plan: "growth" }]]);
    });

    it("opens immediately when the live widget API is ready", () => {
      const liveOpen = vi.fn();
      testWindow().Clickalong = { open: liveOpen };

      open();

      expect(liveOpen).toHaveBeenCalledOnce();
    });

    it("resets immediately when the live widget API is ready", () => {
      const liveReset = vi.fn();
      testWindow().Clickalong = { reset: liveReset };

      reset();

      expect(liveReset).toHaveBeenCalledOnce();
    });

    it("dispatches tour controls immediately when the live API is ready", () => {
      const liveStartTour = vi.fn();
      const liveEndTour = vi.fn();
      const tour = { steps: [{ selector: "#settings" }] };
      testWindow().Clickalong = {
        startTour: liveStartTour,
        endTour: liveEndTour,
      };

      startTour(tour);
      endTour();

      expect(liveStartTour).toHaveBeenCalledWith(tour);
      expect(liveEndTour).toHaveBeenCalledOnce();
    });
  });

  describe("registerActions", () => {
    it("queues a sanitized snapshot before widget.js loads", () => {
      const execute = vi.fn(async () => ({
        status: "completed" as const,
        summary: "Saved view created.",
      }));
      const source = action({
        title: "  Create a saved view  ",
        description: "  Save the current filters.  ",
        parameters: [
          {
            name: "name",
            type: "string",
            description: "  View name.  ",
            required: true,
          },
          {
            name: "scope",
            type: "enum",
            description: "  View scope.  ",
            required: false,
            options: ["  Personal  ", "Shared"],
          },
        ],
        execute,
      });

      registerActions([source]);

      const queued = testWindow().Clickalong?.q?.[0]?.[1] as ClickalongAction[];
      expect(testWindow().Clickalong?.q?.[0]?.[0]).toBe("registerActions");
      expect(queued).not.toBe(source);
      expect(queued[0]).not.toBe(source);
      expect(queued[0]).toMatchObject({
        id: "createSavedView",
        title: "Create a saved view",
        description: "Save the current filters.",
        effect: "create",
      });
      expect(queued[0]?.parameters).toEqual([
        {
          name: "name",
          type: "string",
          description: "View name.",
          required: true,
        },
        {
          name: "scope",
          type: "enum",
          description: "View scope.",
          required: false,
          options: ["Personal", "Shared"],
        },
      ]);
      expect(queued[0]?.execute).toBe(execute);

      source.title = "Changed after registration";
      source.parameters[0]!.description = "Changed";
      expect(queued[0]?.title).toBe("Create a saved view");
      expect(queued[0]?.parameters[0]?.description).toBe("View name.");
    });

    it("dispatches only descriptor-snapshotted values from proxied registries", () => {
      const unsafeRead = vi.fn(() => {
        throw new Error("ordinary proxy reads must not occur");
      });
      const proxiedAction = new Proxy(action(), { get: unsafeRead });
      const proxiedRegistry = new Proxy([proxiedAction], { get: unsafeRead });

      registerActions(proxiedRegistry);

      const queued = testWindow().Clickalong?.q?.[0]?.[1] as ClickalongAction[];
      expect(unsafeRead).not.toHaveBeenCalled();
      expect(queued[0]).toMatchObject({
        id: "createSavedView",
        title: "Create a saved view",
        effect: "create",
      });
      expect(typeof queued[0]?.execute).toBe("function");
    });

    it("ignores inherited schema values and inherited toJSON hooks", () => {
      const missingExecute = action();
      delete (missingExecute as Partial<ClickalongAction>).execute;
      const oversized = Array.from({ length: 20 }, (_, index) =>
        action({
          id: `action_${index}`,
          title: `Action ${index}`,
          description: "é".repeat(500),
          parameters: [],
        }),
      );
      const previousExecute = Object.getOwnPropertyDescriptor(
        Object.prototype,
        "execute",
      );
      const previousToJSON = Object.getOwnPropertyDescriptor(
        Object.prototype,
        "toJSON",
      );
      let missingError: unknown;
      let oversizedError: unknown;

      try {
        Object.defineProperty(Object.prototype, "execute", {
          configurable: true,
          value: async () => ({ status: "completed", summary: "Unsafe" }),
        });
        Object.defineProperty(Object.prototype, "toJSON", {
          configurable: true,
          value: () => ({}),
        });
        try {
          registerActions([missingExecute]);
        } catch (error) {
          missingError = error;
        }
        try {
          registerActions(oversized);
        } catch (error) {
          oversizedError = error;
        }
      } finally {
        if (previousExecute) {
          Object.defineProperty(Object.prototype, "execute", previousExecute);
        } else {
          delete (Object.prototype as { execute?: unknown }).execute;
        }
        if (previousToJSON) {
          Object.defineProperty(Object.prototype, "toJSON", previousToJSON);
        } else {
          delete (Object.prototype as { toJSON?: unknown }).toJSON;
        }
      }

      expect(missingError).toBeInstanceOf(TypeError);
      expect(oversizedError).toBeInstanceOf(TypeError);
      expect(testWindow().Clickalong).toBeUndefined();
    });

    it("dispatches every replacement live, including Strict Mode repeats and [] clearing", () => {
      const liveRegisterActions = vi.fn();
      testWindow().Clickalong = { registerActions: liveRegisterActions };
      const first = action();
      const replacement = action({
        id: "updateProfile",
        title: "Update profile",
        description: "Update the visitor display name.",
        effect: "update",
      });

      registerActions([first]);
      registerActions([first]);
      registerActions([replacement]);
      registerActions([]);

      expect(liveRegisterActions).toHaveBeenCalledTimes(4);
      expect(liveRegisterActions.mock.calls[0]?.[0]?.[0]?.id).toBe("createSavedView");
      expect(liveRegisterActions.mock.calls[1]?.[0]?.[0]?.id).toBe("createSavedView");
      expect(liveRegisterActions.mock.calls[2]?.[0]?.[0]?.id).toBe("updateProfile");
      expect(liveRegisterActions.mock.calls[3]?.[0]).toEqual([]);
      expect(testWindow().Clickalong?.q).toBeUndefined();
    });

    it("queues each replacement in order and supports pre-load clearing", () => {
      registerActions([action()]);
      registerActions([
        action({
          id: "createProject",
          title: "Create project",
          description: "Create a project for the current account.",
          effect: "create",
        }),
      ]);
      registerActions([]);

      expect(testWindow().Clickalong?.q?.map(([method, actions]) => [
        method,
        (actions as ClickalongAction[]).map(({ id }) => id),
      ])).toEqual([
        ["registerActions", ["createSavedView"]],
        ["registerActions", ["createProject"]],
        ["registerActions", []],
      ]);
    });

    it("accepts every supported parameter type at the documented limits", () => {
      const actions = Array.from({ length: 20 }, (_, index) =>
        action({
          id: `action_${index}`,
          title: index === 0 ? "T".repeat(100) : `Action ${index}`,
          description: index === 0 ? "D".repeat(500) : "An allowed action.",
          parameters:
            index === 0
              ? Array.from({ length: 12 }, (__, parameterIndex) => ({
                  name: `parameter_${parameterIndex}`,
                  type: (
                    ["string", "number", "boolean", "enum"] as const
                  )[parameterIndex % 4],
                  description: "P",
                  required: parameterIndex % 2 === 0,
                  ...(
                    parameterIndex % 4 === 3
                      ? { options: Array.from({ length: 50 }, (___, optionIndex) => `value_${optionIndex}`) }
                      : {}
                  ),
                }))
              : [],
        }),
      );

      expect(() => registerActions(actions)).not.toThrow();
      expect(testWindow().Clickalong?.q).toHaveLength(1);
    });

    it("rejects an invalid registry atomically without live dispatch or queue mutation", () => {
      const liveRegisterActions = vi.fn();
      testWindow().Clickalong = {
        q: [["open"]],
        registerActions: liveRegisterActions,
      };

      expect(() =>
        registerActions([
          action(),
          action({ id: "invalid id" }),
        ]),
      ).toThrow(TypeError);
      expect(liveRegisterActions).not.toHaveBeenCalled();
      expect(testWindow().Clickalong?.q).toEqual([["open"]]);
    });

    it("rejects malformed schemas and count/string limits", () => {
      const validParameter = {
        name: "name",
        type: "string" as const,
        description: "View name.",
        required: true,
      };
      const sparseActions = new Array<ClickalongAction>(1);
      const hugeSparseActions = new Array<ClickalongAction>(1_000_000_000);
      const sparseParameters = new Array<ClickalongAction["parameters"][number]>(1);
      const sparseOptions = new Array<string>(1);
      const accessorAction = action();
      Object.defineProperty(accessorAction, "title", {
        enumerable: true,
        get: () => "Create a saved view",
      });
      const decoratedRegistry = [action()];
      Object.defineProperty(decoratedRegistry, "extra", { value: true });
      const invalidRegistries: unknown[] = [
        null,
        {},
        sparseActions,
        hugeSparseActions,
        decoratedRegistry,
        Array.from({ length: 21 }, (_, index) => action({ id: `action_${index}` })),
        [action({ id: "9invalid" })],
        [action({ id: `a${"x".repeat(64)}` })],
        [action({ title: " " })],
        [action({ title: "T".repeat(101) })],
        [action({ description: "D".repeat(501) })],
        [action({ effect: "delete" as never })],
        [action({ execute: undefined as never })],
        [accessorAction],
        [action({ parameters: {} as never })],
        [action({ parameters: sparseParameters })],
        [action({ parameters: [null as never] })],
        [action({ parameters: Array.from({ length: 13 }, (_, index) => ({ ...validParameter, name: `value_${index}` })) })],
        [action({ parameters: [validParameter, { ...validParameter }] })],
        [action({ parameters: [{ ...validParameter, name: "bad-name" }] })],
        [action({ parameters: [{ ...validParameter, name: `a${"x".repeat(64)}` }] })],
        [action({ parameters: [{ ...validParameter, type: "object" as never }] })],
        [action({ parameters: [{ ...validParameter, description: " " }] })],
        [action({ parameters: [{ ...validParameter, description: "D".repeat(301) }] })],
        [action({ parameters: [{ ...validParameter, required: "yes" as never }] })],
        [action({ parameters: [{ ...validParameter, options: ["unused"] }] })],
        [action({ parameters: [{ ...validParameter, type: "enum", options: undefined }] })],
        [action({ parameters: [{ ...validParameter, type: "enum", options: [] }] })],
        [action({ parameters: [{ ...validParameter, type: "enum", options: sparseOptions }] })],
        [action({ parameters: [{ ...validParameter, type: "enum", options: [42 as never] }] })],
        [action({ parameters: [{ ...validParameter, type: "enum", options: Array.from({ length: 51 }, (_, index) => `value_${index}`) }] })],
        [action({ parameters: [{ ...validParameter, type: "enum", options: ["same", " same "] }] })],
        [action({ parameters: [{ ...validParameter, type: "enum", options: [" "] }] })],
        [action({ parameters: [{ ...validParameter, type: "enum", options: ["V".repeat(101)] }] })],
        [action({ parameters: [{ ...validParameter, extra: true } as never] })],
        [{ ...action(), extra: true }],
        [action(), action()],
      ];

      for (const registry of invalidRegistries) {
        delete testWindow().Clickalong;
        expect(() => registerActions(registry as ClickalongAction[])).toThrow(TypeError);
        expect(testWindow().Clickalong).toBeUndefined();
      }
    });

    it("rejects prohibited categories anywhere in action or parameter metadata", () => {
      const prohibited = [
        "delete",
        "destroy",
        "erase",
        "remove",
        "billing",
        "invoice",
        "payment",
        "purchase",
        "buy",
        "checkout",
        "subscription",
        "permission",
        "privilege",
        "security",
        "credential",
        "password",
        "passcode",
        "otp",
        "one-time password",
        "secret",
        "token",
        "api key",
        "file",
        "upload",
        "download",
        "attachment",
        "refund",
        "cancel account",
        "irreversible",
        "arbitrary",
        "script",
        "javascript",
        "code execution",
      ];

      for (const category of prohibited) {
        expect(() =>
          registerActions([action({ description: `Handle ${category} settings.` })]),
        ).toThrow(TypeError);
      }
      expect(() => registerActions([action({ id: "deleteWorkspace" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "rotateAPIKey" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "subscribeUser" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "checkOut" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "executeCode" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "archiveWorkspace" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "deactivateUser" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "chargeAccount" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "userPromote" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "makeMemberAdmin" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "changeMemberRole" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "grantUserAccess" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "wipeWorkspace" })])).toThrow(TypeError);
      expect(() => registerActions([action({ id: "clearWorkspaceData" })])).toThrow(TypeError);
      expect(() => registerActions([action({
        id: "plan.upgrade",
        title: "Upgrade plan",
        description: "Move this workspace to the Pro tier",
        effect: "update",
        parameters: [],
      })])).toThrow(TypeError);
      expect(() => registerActions([action({ parameters: [{
        name: "role",
        type: "enum",
        description: "Membership level",
        required: true,
        options: ["owner", "member"],
      }] })])).toThrow(TypeError);
      expect(() => registerActions([action({ parameters: [{
        name: "creditCardNumber",
        type: "string",
        description: "Card number",
        required: true,
      }] })])).toThrow(TypeError);
      expect(() => registerActions([action({ parameters: [{
        name: "cvv",
        type: "string",
        description: "Verification value",
        required: true,
      }] })])).toThrow(TypeError);
      expect(() => registerActions([action({ title: "Manage billing" })])).toThrow(TypeError);
      expect(() => registerActions([action({
        parameters: [{
          name: "apiKey",
          type: "string",
          description: "A value.",
          required: true,
        }],
      })])).toThrow(TypeError);
      expect(() => registerActions([action({
        parameters: [{
          name: "destination",
          type: "string",
          description: "A file destination.",
          required: true,
        }],
      })])).toThrow(TypeError);
      expect(() => registerActions([action({
        parameters: [{
          name: "choice",
          type: "enum",
          description: "Choose a destination.",
          required: true,
          options: ["General", "Security"],
        }],
      })])).toThrow(TypeError);
    });

    it.each([
      "Transfer funds",
      "Withdraw balance",
      "Deposit cash",
      "Confirm order",
      "Send money",
      "Move cash",
      "Wire balance",
      "Placed order",
      "Commit your order",
      "Finalised my orders",
      "Pays vendor",
      "Mark as paid",
      "Depositing balance",
      "Deposited cash",
      "Withdrew funds",
      "Withdrawn balance",
      "Wíthdrawal status",
      "Wіthdrawal status",
      "Quick access panel",
    ])("rejects a confirmed host action that would %s", (title) => {
      expect(() => registerActions([action({ title })])).toThrow(TypeError);
    });

    it.each([
      "Créez une note",
      "Создать заметку",
      "Create заметку",
    ])("allows benign localized host-action metadata: %s", (title) => {
      expect(() => registerActions([action({ title })])).not.toThrow();
    });

    it("allows benign right-sidebar metadata", () => {
      expect(() => registerActions([action({
        id: "showSidePanel",
        title: "Right sidebar",
        description: "Show the side panel for the current view.",
        effect: "update",
        parameters: [],
      })])).not.toThrow();
    });

    it("rejects a sanitized manifest over 12 KB using UTF-8 byte length", () => {
      const oversized = Array.from({ length: 20 }, (_, index) =>
        action({
          id: `action_${index}`,
          title: `Action ${index}`,
          description: "é".repeat(500),
          parameters: [],
        }),
      );

      expect(() => registerActions(oversized)).toThrow(/12_?288|12288|manifest/i);
      expect(testWindow().Clickalong).toBeUndefined();
    });
  });

  it("is a complete no-op during SSR", () => {
    vi.stubGlobal("window", undefined);

    expect(() => {
      init({ key: "pk_ssr" });
      identify({ email: "jane@acme.test" });
      reset();
      set({ plan: "growth" });
      open();
      registerActions(null as never);
      startTour({ steps: [{ selector: "#settings" }] });
      endTour();
    }).not.toThrow();
    expect(document.scripts).toHaveLength(0);
  });
});
