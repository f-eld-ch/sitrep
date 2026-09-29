import { describe, expect, it } from "vitest";
import { hashDomain } from "./FeatureFlags";

describe("hashDomain", () => {
  it.each([
    ["localhost", "49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d9763"],
    ["dev.sitrep.ch", "b4c6e989ddba23746750f1954e7f03e87ca54bc28f8540d689b5aa24ea1af5d3"],
    ["demo.sitrep.ch", "29a71de54a6f3a43b18a4bc73a279df460be80daaff914a7f9e44c3b65eb5905"],
  ])("hashes %s to the expected SHA-256 hex string", async (domain, expected) => {
    await expect(hashDomain(domain)).resolves.toBe(expected);
  });
});
