import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";
import { CasualtySection, type CasualtyDeltas } from "./TriageView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("components/babs/useBabsIcons", () => ({ useBabsIcons: () => false }));

const zero: CasualtyDeltas = {
  vermisste: 0,
  tote: 0,
  verletzte: 0,
  obdachlose: 0,
  eingeschlossene: 0,
};

function Harness({
  initial = zero,
  total,
  previous,
}: {
  initial?: CasualtyDeltas;
  total: number;
  previous?: CasualtyDeltas;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CasualtySection
      value={value}
      spCasualties={{ ...zero, vermisste: total }}
      previous={previous}
      onChange={setValue}
    />
  );
}

describe("CasualtySection minimum delta", () => {
  // The first row is vermisste (missing persons).
  const minus = () => screen.getAllByRole("button", { name: /−1$/ })[0];
  const plus = () => screen.getAllByRole("button", { name: /\+1$/ })[0];

  it("allows -1, back to 0 and -1 again with 1 missing person", () => {
    render(<Harness total={1} />);
    fireEvent.click(minus());
    expect(minus()).toBeDisabled();
    fireEvent.click(plus());
    expect(minus()).toBeEnabled();
    fireEvent.click(minus());
    expect(minus()).toBeDisabled();
  });

  it("excludes this message's already-saved delta from the total", () => {
    // Saved delta -1 is already reflected in the SP total (now 0).
    const saved = { ...zero, vermisste: -1 };
    render(<Harness total={0} initial={saved} previous={saved} />);
    fireEvent.click(plus());
    expect(minus()).toBeEnabled();
    fireEvent.click(minus());
    expect(minus()).toBeDisabled();
  });
});
