import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useContext } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import de from "../../../i18n/locales/de/translations.json";
import { LayerContext, LayersProvider, type WMSState } from "../LayerContext";
import WMSLayerMenu from "./WMSLayerMenu";

function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}

const language = vi.hoisted(() => ({ current: "de" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: lookup, i18n: { language: language.current } }),
}));

const SERVER = "https://wms.example.ch/service";
const OTHER_SERVER = "https://other.example.org/wms";

/** A WMS 1.3.0 capabilities document: a root with the given sub-layers. */
function capabilities(rootCrs: string[], layers: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms" xmlns:xlink="http://www.w3.org/1999/xlink">
  <Service><Name>WMS</Name><Title>Example</Title></Service>
  <Capability>
    <Layer>
      <Name>root</Name><Title>Root</Title>
      ${rootCrs.map((crs) => `<CRS>${crs}</CRS>`).join("")}
      ${layers}
    </Layer>
  </Capability>
</WMS_Capabilities>`;
}

const wmsLayer = (name: string, title: string, extra = "") =>
  `<Layer queryable="1"><Name>${name}</Name><Title>${title}</Title>${extra}</Layer>`;

const LEGEND = `<Style><Name>default</Name><Title>d</Title><LegendURL width="1" height="1"><Format>image/png</Format><OnlineResource xlink:type="simple" xlink:href="https://wms.example.ch/legend.png"/></LegendURL></Style>`;

const GOOD_DOCUMENT = capabilities(
  ["EPSG:3857"],
  wmsLayer("zeta", "Zeta") + wmsLayer("alpha", "Alpha", LEGEND),
);

const fetchMock = vi.fn();
const respondWith = (body: string) =>
  fetchMock.mockResolvedValue({ text: () => Promise.resolve(body) });

function Probe() {
  const { state } = useContext(LayerContext);
  return <pre data-testid="wms">{JSON.stringify(state.wms)}</pre>;
}

const wmsState = () => JSON.parse(screen.getByTestId("wms").textContent ?? "{}") as WMSState;

function seed(wms: Partial<WMSState>) {
  localStorage.setItem(
    "wmsLayersState",
    JSON.stringify({
      activeLayers: [],
      availableLayers: {},
      currentServer: "",
      servers: [{ name: "Example", url: SERVER }],
      ...wms,
    }),
  );
}

function renderMenu(children: ReactNode = null) {
  return render(
    <LayersProvider>
      <WMSLayerMenu />
      <Probe />
      {children}
    </LayersProvider>,
  );
}

const active = (over: object = {}) => ({
  name: "gefahr",
  title: "Gefahrenkarte",
  server: SERVER,
  opacity: 0.5,
  isVisible: true,
  ...over,
});

const openForm = () =>
  fireEvent.click(screen.getByRole("button", { name: /WMS-Layer hinzufügen/ }));

beforeEach(() => {
  localStorage.clear();
  seed({});
  language.current = "de";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("WMSLayerMenu active layers", () => {
  it("lists the active layers by title", () => {
    seed({ activeLayers: [active(), active({ name: "b", title: "Bodenkarte" })] });
    renderMenu();

    expect(screen.getByText("Gefahrenkarte")).toBeInTheDocument();
    expect(screen.getByText("Bodenkarte")).toBeInTheDocument();
  });

  it("toggles a layer's visibility by clicking its row", () => {
    seed({ activeLayers: [active()] });
    renderMenu();

    fireEvent.click(screen.getByText("Gefahrenkarte"));
    expect(wmsState().activeLayers[0].isVisible).toBe(false);

    fireEvent.click(screen.getByText("Gefahrenkarte"));
    expect(wmsState().activeLayers[0].isVisible).toBe(true);
  });

  it("toggles the visibility with the eye button only once", () => {
    seed({ activeLayers: [active()] });
    renderMenu();
    // legend-less layer: eye, then trash
    const [eye] = within(
      screen.getByText("Gefahrenkarte").closest("div[class*=cursor-pointer]") as HTMLElement,
    ).getAllByRole("button");

    fireEvent.click(eye);

    expect(wmsState().activeLayers[0].isVisible).toBe(false);
  });

  it("changes the opacity without toggling the layer", () => {
    seed({ activeLayers: [active()] });
    renderMenu();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.2" } });

    expect(wmsState().activeLayers[0]).toMatchObject({ opacity: 0.2, isVisible: true });
  });

  it("removes a layer without toggling it first", () => {
    seed({ activeLayers: [active(), active({ name: "b", title: "Bodenkarte" })] });
    renderMenu();
    const row = screen
      .getByText("Gefahrenkarte")
      .closest("div[class*=cursor-pointer]") as HTMLElement;
    const buttons = within(row).getAllByRole("button");

    fireEvent.click(buttons[buttons.length - 1]);

    expect(wmsState().activeLayers.map((l) => l.name)).toEqual(["b"]);
    expect(screen.queryByText("Gefahrenkarte")).not.toBeInTheDocument();
  });

  it("shows and hides the legend of a layer that has one", () => {
    seed({ activeLayers: [active({ legendURL: "https://wms.example.ch/legend.png" })] });
    renderMenu();
    const row = screen
      .getByText("Gefahrenkarte")
      .closest("div[class*=cursor-pointer]") as HTMLElement;
    const [info] = within(row).getAllByRole("button");

    fireEvent.click(info);
    expect(screen.getByRole("img", { name: "Gefahrenkarte" })).toHaveAttribute(
      "src",
      "https://wms.example.ch/legend.png",
    );
    // the legend does not change the layer
    expect(wmsState().activeLayers[0].isVisible).toBe(true);

    fireEvent.click(info);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("offers no legend button for a layer without one", () => {
    seed({ activeLayers: [active()] });
    renderMenu();
    const row = screen
      .getByText("Gefahrenkarte")
      .closest("div[class*=cursor-pointer]") as HTMLElement;

    // eye and trash
    expect(within(row).getAllByRole("button")).toHaveLength(2);
  });
});

describe("WMSLayerMenu adding a layer", () => {
  it("only shows the add button until asked", () => {
    renderMenu();

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    openForm();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /WMS-Layer hinzufügen/ })).not.toBeInTheDocument();
  });

  it("offers the servers of the current language and a custom one", () => {
    seed({
      servers: [
        { name: "Gefahrenkarte", url: "https://de.example/wms", language: "de" },
        { name: "Cartes des dangers", url: "https://fr.example/wms", language: "fr" },
        { name: "geo.admin.ch", url: "https://wms.geo.admin.ch" },
      ],
    });
    renderMenu();

    openForm();

    expect(
      within(screen.getByRole("combobox"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Gefahrenkarte", "geo.admin.ch", "Benutzerdefinierter Server"]);
  });

  it("fetches the capabilities of the chosen server and lists its compatible layers by title", async () => {
    respondWith(GOOD_DOCUMENT);
    renderMenu();
    openForm();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: SERVER } });

    await waitFor(() => expect(screen.getAllByRole("combobox")).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledWith(
      `${SERVER}?&SERVICE=WMS&VERSION=1.3.0&request=getCapabilities&parameterlang=de`,
    );
    const options = within(screen.getAllByRole("combobox")[1]).getAllByRole("option");
    // the placeholder, then the titles in alphabetical order
    expect(options.map((o) => o.textContent)).toEqual(["Layer auswählen", "Alpha", "Root", "Zeta"]);
    // the layers are remembered for this server
    expect(Object.keys(wmsState().availableLayers)).toEqual([SERVER]);
  });

  it("adds the chosen layer at 70% opacity and closes the form", async () => {
    respondWith(GOOD_DOCUMENT);
    renderMenu();
    openForm();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: SERVER } });
    await waitFor(() => expect(screen.getAllByRole("combobox")).toHaveLength(2));

    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "alpha" } });

    expect(wmsState().activeLayers).toEqual([
      {
        name: "alpha",
        title: "Alpha",
        opacity: 0.7,
        server: SERVER,
        isVisible: true,
        legendURL: "https://wms.example.ch/legend.png",
      },
    ]);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /WMS-Layer hinzufügen/ })).toBeInTheDocument();
  });

  it("uses the layers it already knows instead of asking the server again", () => {
    seed({
      currentServer: SERVER,
      availableLayers: {
        [SERVER]: [
          { name: "cached", title: "Aus dem Cache", server: SERVER, opacity: 1, isVisible: true },
        ],
      },
    });
    renderMenu();
    openForm();

    expect(screen.getByRole("option", { name: "Aus dem Cache" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for the capabilities in the language of the app", async () => {
    language.current = "fr";
    respondWith(GOOD_DOCUMENT);
    seed({ currentServer: SERVER });
    renderMenu();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock.mock.calls[0][0]).toContain("parameterlang=fr");
  });
});

describe("WMSLayerMenu errors", () => {
  it("explains that no layer supports EPSG:3857, and can be dismissed", async () => {
    respondWith(capabilities(["EPSG:4326"], wmsLayer("a", "A")));
    seed({ currentServer: SERVER });
    renderMenu();

    expect(await screen.findByText(de.mapview.wmsLayerMenu.noLayersFound)).toBeInTheDocument();
    // the server stays, so the user can pick another layer set later
    expect(wmsState().servers.map((s) => s.url)).toEqual([SERVER]);

    fireEvent.click(screen.getByRole("button", { name: "schliessen" }));

    expect(screen.queryByText(de.mapview.wmsLayerMenu.noLayersFound)).not.toBeInTheDocument();
  });

  it("keeps a layer that is EPSG:3857 only by its own crs", async () => {
    respondWith(
      capabilities(["EPSG:4326"], wmsLayer("a", "A", "<CRS>EPSG:3857</CRS>") + wmsLayer("b", "B")),
    );
    seed({ currentServer: SERVER });
    renderMenu();
    openForm();

    await waitFor(() => expect(screen.getAllByRole("combobox")).toHaveLength(2));

    expect(
      within(screen.getAllByRole("combobox")[1])
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toContain("A");
    expect(
      within(screen.getAllByRole("combobox")[1])
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).not.toContain("B");
  });

  it("forgets a server that cannot be reached and says so", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    seed({
      currentServer: OTHER_SERVER,
      servers: [
        { name: "Example", url: SERVER },
        { name: "Other", url: OTHER_SERVER },
      ],
    });
    renderMenu();

    expect(
      await screen.findByText(de.mapview.wmsLayerMenu.errorFetchingLayers),
    ).toBeInTheDocument();
    expect(wmsState().servers.map((s) => s.url)).toEqual([SERVER]);
  });

  it("treats an answer that is not capabilities as an unreachable server", async () => {
    respondWith("<html>not a wms</html>");
    seed({
      currentServer: OTHER_SERVER,
      servers: [
        { name: "Example", url: SERVER },
        { name: "Other", url: OTHER_SERVER },
      ],
    });
    renderMenu();

    expect(
      await screen.findByText(de.mapview.wmsLayerMenu.errorFetchingLayers),
    ).toBeInTheDocument();
  });
});

describe("WMSLayerMenu custom server", () => {
  const chooseCustom = () => {
    openForm();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
  };

  it("fetches the layers of a server the user types in, named after its host", async () => {
    respondWith(GOOD_DOCUMENT);
    renderMenu();
    chooseCustom();

    fireEvent.change(screen.getByPlaceholderText("WMS-Server-URL eingeben"), {
      target: { value: "https://custom.example.net/wms?map=x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Layer abrufen" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(wmsState().servers).toContainEqual({
      name: "custom.example.net",
      url: "https://custom.example.net/wms?map=x",
    });
    expect(wmsState().currentServer).toBe("https://custom.example.net/wms?map=x");
  });

  it("does nothing for an empty address", () => {
    renderMenu();
    chooseCustom();

    fireEvent.click(screen.getByRole("button", { name: "Layer abrufen" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wmsState().servers).toHaveLength(1);
  });

  it("names a server by its address when it is not a valid URL", () => {
    fetchMock.mockRejectedValue(new Error("network"));
    renderMenu();
    chooseCustom();

    fireEvent.change(screen.getByPlaceholderText("WMS-Server-URL eingeben"), {
      target: { value: "not a url" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Layer abrufen" }));

    expect(wmsState().servers).toContainEqual({ name: "not a url", url: "not a url" });
  });
});
