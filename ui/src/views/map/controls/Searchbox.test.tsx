import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SearchControl from "./Searchbox";

const mocks = vi.hoisted(() => ({
  flyTo: vi.fn(),
  map: { current: undefined as unknown },
}));

vi.mock("react-map-gl/maplibre", () => ({ useMap: () => ({ current: mocks.map.current }) }));

const fetchMock = vi.fn();

const geoAdminResult = (id: number, label: string, lon: number, lat: number) => ({
  id,
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { label, lon, lat },
});

const input = () => screen.getByRole("searchbox");
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const settle = () => act(() => vi.advanceTimersByTimeAsync(1000));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  mocks.flyTo.mockReset();
  mocks.map.current = { flyTo: mocks.flyTo };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Searchbox", () => {
  it("searches the geo.admin.ch locations for what is typed, once typing has paused", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ features: [] }) });
    render(<SearchControl />);

    type("Bern");
    expect(fetchMock).not.toHaveBeenCalled();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(
      "https://api3.geo.admin.ch/rest/services/api/SearchServer",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      searchText: "Bern",
      type: "locations",
      geometryFormat: "geojson",
      origins: "address,gazetteer,parcel",
      limit: "10",
    });
  });

  it("searches at once with Enter", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ features: [] }) });
    render(<SearchControl />);
    type("Bern");

    fireEvent.keyDown(input(), { key: "Enter" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await settle();
  });

  it("lists the results with their labels formatted", async () => {
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
          features: [
            geoAdminResult(1, "<b>Bern</b> (BE)", 7.44, 46.95),
            geoAdminResult(2, "Bernex (GE)", 6.07, 46.17),
          ],
        }),
    });
    render(<SearchControl />);

    type("Bern");
    await settle();

    expect(screen.getByText("Bern", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText("Bernex (GE)")).toBeInTheDocument();
  });

  it("flies to a chosen result and clears the search", async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ features: [geoAdminResult(2, "Bernex (GE)", 6.07, 46.17)] }),
    });
    render(<SearchControl />);
    type("Bern");
    await settle();

    fireEvent.click(screen.getByText("Bernex (GE)"));

    expect(mocks.flyTo).toHaveBeenCalledWith({
      center: [6.07, 46.17],
      zoom: 17,
      animate: true,
      duration: 2500,
    });
    expect(screen.queryByText("Bernex (GE)")).not.toBeInTheDocument();
    expect(input()).toHaveValue("");
  });

  it("shows no results when the search service fails or answers nonsense", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<SearchControl />);
    type("Bern");
    await settle();

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ error: "x" }) });
    type("Bernex");
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.querySelector("a")).toBeNull();
  });

  it("offers a typed WGS84 coordinate without asking the search service", async () => {
    render(<SearchControl />);

    type("46.97984 6.60757");
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/^WGS 84/)).toHaveTextContent("WGS 84 (lat/lon) 46.980, 6.608");
  });

  it("flies to a typed LV95 coordinate in WGS84", async () => {
    render(<SearchControl />);
    type("2600000 1200000");
    await settle();

    fireEvent.click(screen.getByText(/2600000|2'600'000|1200000/));

    const { center } = mocks.flyTo.mock.calls[0][0];
    // the origin of the Swiss grid is in Bern
    expect(center[0]).toBeCloseTo(7.4386, 3);
    expect(center[1]).toBeCloseTo(46.9511, 3);
  });
});
