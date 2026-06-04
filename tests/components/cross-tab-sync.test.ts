import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { broadcastInvalidate, useCrossTabSync } from "@/lib/sync/cross-tab-sync";

/**
 * Minimal in-context BroadcastChannel: delivers a posted message to every OTHER
 * channel registered under the same name (a channel never receives its own
 * posts), asynchronously — matching the real cross-tab semantics within a
 * single test process.
 */
class FakeBroadcastChannel {
  static registry = new Map<string, Set<FakeBroadcastChannel>>();
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(public name: string) {
    const set = FakeBroadcastChannel.registry.get(name) ?? new Set();
    set.add(this);
    FakeBroadcastChannel.registry.set(name, set);
  }

  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.registry.get(this.name) ?? []) {
      if (channel === this) continue;
      queueMicrotask(() => channel.onmessage?.({ data }));
    }
  }

  close() {
    FakeBroadcastChannel.registry.get(this.name)?.delete(this);
  }
}

beforeAll(() => {
  (globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel =
    FakeBroadcastChannel;
});

afterEach(() => {
  FakeBroadcastChannel.registry.clear();
});

describe("cross-tab query sync (TRD §4.1 multi-tab)", () => {
  it("invalidates the broadcast keys in a subscribed (other-tab) client", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useCrossTabSync(client));

    broadcastInvalidate(["balance", "emp_alice"], ["requests", "pending"]);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ["balance", "emp_alice"] });
      expect(spy).toHaveBeenCalledWith({ queryKey: ["requests", "pending"] });
    });
  });

  it("ignores messages that are not invalidation events", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useCrossTabSync(client));

    const channel = new FakeBroadcastChannel("examplehr-timeoff-sync");
    channel.postMessage({ type: "something-else" });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(spy).not.toHaveBeenCalled();
  });
});
