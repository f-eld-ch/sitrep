import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import { CasualtyList } from "./CasualtyList";
import { CASUALTY_CATEGORIES, ZERO_CASUALTIES, addCasualties } from "./categories";

function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: lookup }) }));
vi.mock("@f-eld-ch/babs-react", () => ({
  BabsIcon: ({ icon }: { icon: string }) => <span data-testid="babs-icon" data-icon={icon} />,
}));

const totals = { verletzte: 4, vermisste: 0, obdachlose: 2, eingeschlossene: 0, tote: 1 };

describe("CasualtyList", () => {
  it.each(["compact", "cards", "rows"] as const)("shows every category in %s", (variant) => {
    render(<CasualtyList totals={totals} iconsLoaded variant={variant} />);

    for (const cat of CASUALTY_CATEGORIES) {
      expect(screen.getByText(lookup(cat.labelKey))).toBeInTheDocument();
    }
    expect(screen.getAllByTestId("babs-icon").map((i) => i.getAttribute("data-icon"))).toEqual([
      "1301",
      "1302",
      "1303",
      "1304",
      "1305",
    ]);
  });

  it("defaults to the compact variant", () => {
    const { container } = render(<CasualtyList totals={totals} iconsLoaded />);

    expect(container.firstElementChild).toHaveClass("space-y-2");
  });

  it.each(["compact", "cards", "rows"] as const)(
    "shows the counts in %s, without icons until they are loaded",
    (variant) => {
      render(<CasualtyList totals={totals} iconsLoaded={false} variant={variant} />);

      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.queryByTestId("babs-icon")).not.toBeInTheDocument();
    },
  );

  it("omits the zero categories on request", () => {
    render(<CasualtyList totals={totals} iconsLoaded hideZero />);

    expect(screen.getByText(de.casualties.verletzte)).toBeInTheDocument();
    expect(screen.queryByText(de.casualties.vermisste)).not.toBeInTheDocument();
    expect(screen.queryByText(de.casualties.eingeschlossene)).not.toBeInTheDocument();
  });

  it("says so when nothing is left to show", () => {
    render(<CasualtyList totals={ZERO_CASUALTIES} iconsLoaded hideZero />);

    expect(screen.getByText(de.casualties.none)).toBeInTheDocument();
  });
});

describe("addCasualties", () => {
  it("adds category by category", () => {
    expect(addCasualties(totals, { ...ZERO_CASUALTIES, tote: 2, vermisste: 3 })).toEqual({
      verletzte: 4,
      vermisste: 3,
      obdachlose: 2,
      eingeschlossene: 0,
      tote: 3,
    });
  });
});
