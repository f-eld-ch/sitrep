import type { SchadenplatzWithResources } from "api";

export type CasualtyTotals = SchadenplatzWithResources["casualties"];

export type CasualtyCategory = {
  key: keyof CasualtyTotals;
  labelKey: string;
  babsId: string;
};

// Display order shared by the dashboard and the casualties page.
export const CASUALTY_CATEGORIES: CasualtyCategory[] = [
  { key: "verletzte", labelKey: "casualties.verletzte", babsId: "1301" },
  { key: "vermisste", labelKey: "casualties.vermisste", babsId: "1302" },
  {
    key: "eingeschlossene",
    labelKey: "casualties.eingeschlossene",
    babsId: "1304",
  },
  { key: "obdachlose", labelKey: "casualties.obdachlose", babsId: "1303" },
  { key: "tote", labelKey: "casualties.tote", babsId: "1305" },
];

export const ZERO_CASUALTIES: CasualtyTotals = {
  vermisste: 0,
  tote: 0,
  verletzte: 0,
  obdachlose: 0,
  eingeschlossene: 0,
};

export function addCasualties(a: CasualtyTotals, b: CasualtyTotals): CasualtyTotals {
  return {
    vermisste: a.vermisste + b.vermisste,
    tote: a.tote + b.tote,
    verletzte: a.verletzte + b.verletzte,
    obdachlose: a.obdachlose + b.obdachlose,
    eingeschlossene: a.eingeschlossene + b.eingeschlossene,
  };
}
