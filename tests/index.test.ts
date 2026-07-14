import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  endTour,
  identify,
  init,
  open,
  reset,
  set,
  startTour,
} from "../src/index";

interface TestApi {
  q?: unknown[][];
  identify?: (...args: unknown[]) => void;
  reset?: (...args: unknown[]) => void;
  set?: (...args: unknown[]) => void;
  open?: (...args: unknown[]) => void;
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

  it("is a complete no-op during SSR", () => {
    vi.stubGlobal("window", undefined);

    expect(() => {
      init({ key: "pk_ssr" });
      identify({ email: "jane@acme.test" });
      reset();
      set({ plan: "growth" });
      open();
      startTour({ steps: [{ selector: "#settings" }] });
      endTour();
    }).not.toThrow();
    expect(document.scripts).toHaveLength(0);
  });
});
