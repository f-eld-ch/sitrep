import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const catalogue = vi.hoisted(() => {
  let release: () => void = () => {};
  return {
    gate: new Promise<void>((resolve) => {
      release = resolve;
    }),
    release: () => release(),
    register: vi.fn(),
    icons: { sample: "svg" },
  };
});

vi.mock("@f-eld-ch/babs-react", () => ({ registerBabsIcons: catalogue.register }));
vi.mock("@f-eld-ch/babs-react/all", async () => {
  await catalogue.gate;
  return { default: catalogue.icons };
});

describe("useBabsIcons", () => {
  it("reports not ready until the catalogue is registered, then stays ready", async () => {
    const { useBabsIcons } = await import("./useBabsIcons");
    const first = renderHook(() => useBabsIcons());

    expect(first.result.current).toBe(false);
    expect(catalogue.register).not.toHaveBeenCalled();

    await act(async () => {
      catalogue.release();
    });

    expect(first.result.current).toBe(true);
    expect(catalogue.register).toHaveBeenCalledExactlyOnceWith(catalogue.icons);

    // Remounting neither re-registers nor flashes the placeholders.
    const second = renderHook(() => useBabsIcons());
    expect(second.result.current).toBe(true);
    await act(async () => {});
    expect(catalogue.register).toHaveBeenCalledTimes(1);
  });
});
