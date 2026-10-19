// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/ui/App";
import type { UIToPluginMessage } from "../src/shared/messages";

let container: HTMLDivElement;
let root: Root;
let outbound: UIToPluginMessage[];

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  outbound = [];
  vi.spyOn(window.parent, "postMessage").mockImplementation((message: unknown) => {
    if (message && typeof message === "object" && "pluginMessage" in message) {
      // These messages are emitted by the typed, in-process UI, not external input.
      const envelope = message as { pluginMessage: UIToPluginMessage };
      outbound.push(envelope.pluginMessage);
    }
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<App />); });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function loadButton(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(".section-heading button");
  if (!button) throw new Error("Load selected frames control is missing");
  return button;
}

async function receive(pluginMessage: unknown, source: MessageEventSource | null = null) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent("message", { data: { pluginMessage }, source }));
  });
}

const ready = { type: "PLUGIN_READY", payload: { pluginName: "Frame2Slides", version: "1.0.0" } };

describe("Figma UI handshake", () => {
  it.each(["native bridge", "browser parent"] as const)("unlocks frame loading for %s messages and recovers after selection failure", async transport => {
    const source = transport === "native bridge" ? null : window.parent;
    expect(loadButton().disabled).toBe(true);
    await receive(ready, source);
    expect(loadButton().disabled).toBe(false);

    await act(async () => { loadButton().click(); });
    expect(loadButton().disabled).toBe(true);
    const request = outbound.find(message => message.type === "LOAD_SELECTION");
    if (!request || request.type !== "LOAD_SELECTION") throw new Error("Selection request was not started");

    await receive({ type: "ERROR", requestId: "unrelated-selection", message: "No frames selected" }, source);
    expect(loadButton().disabled).toBe(true);
    await receive({ type: "ERROR", requestId: request.requestId, message: "No frames selected" }, source);
    expect(loadButton().disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("connects when the host delivers directly through the documented onmessage callback", async () => {
    await act(async () => {
      window.onmessage?.call(window, new MessageEvent("message", { data: { pluginMessage: ready } }));
    });
    expect(loadButton().disabled).toBe(false);
  });

  it("accepts validated host-forwarded messages without assuming immediate parent identity", async () => {
    const relay = document.createElement("iframe");
    document.body.appendChild(relay);
    try {
      const source = relay.contentWindow;
      if (!source) throw new Error("Host relay has no window");
      await receive(ready, source);
      expect(loadButton().disabled).toBe(false);
    } finally {
      relay.remove();
    }
  });

  it("does not connect on malformed bridge payloads", async () => {
    await receive({ type: "PLUGIN_READY", payload: { pluginName: "Frame2Slides" } });
    expect(loadButton().disabled).toBe(true);
    await receive({ type: "PLUGIN_READY", payload: { pluginName: 42, version: "1.0.0" } });
    expect(loadButton().disabled).toBe(true);
    await receive(ready);
    expect(loadButton().disabled).toBe(false);
  });
});
