import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserContext } from "utils";
import { Provider, hashDomain } from "./FeatureFlags";

const openFeature = vi.hoisted(() => ({
  setProvider: vi.fn(),
  setContext: vi.fn(),
}));
const flipt = vi.hoisted(() => ({ constructed: vi.fn() }));

vi.mock("@openfeature/react-sdk", () => ({
  OpenFeature: openFeature,
  OpenFeatureProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="openfeature">{children}</div>
  ),
}));

vi.mock("@openfeature/flipt-web-provider", () => ({
  FliptWebProvider: class {
    constructor(...args: unknown[]) {
      flipt.constructed(...args);
    }
  },
}));

function renderWithUser(email: string) {
  return render(
    <UserContext.Provider
      value={{
        state: { isLoggedin: true, username: "anna", email, sub: "sub-1" },
        dispatch: () => null,
      }}
    >
      <Provider>
        <p>app</p>
      </Provider>
    </UserContext.Provider>,
  );
}

describe("FeatureFlags Provider", () => {
  beforeEach(() => {
    openFeature.setProvider.mockClear();
    openFeature.setContext.mockClear();
    flipt.constructed.mockClear();
  });

  it("renders its children inside the OpenFeature provider", () => {
    renderWithUser("anna@example.ch");

    expect(screen.getByTestId("openfeature")).toContainElement(screen.getByText("app"));
  });

  it("registers the Flipt provider for the UI namespace", () => {
    renderWithUser("anna@example.ch");

    expect(flipt.constructed).toHaveBeenCalledTimes(1);
    expect(flipt.constructed).toHaveBeenCalledWith(
      "sitrep-ui",
      { url: "https://flipt.sitrep.ch" },
      console,
    );
    expect(openFeature.setProvider).toHaveBeenCalledTimes(1);
  });

  it("targets the flags with the user's email and the hashed host", async () => {
    renderWithUser("anna@example.ch");

    const domain = document.location.host.split(":")[0];
    const domainHash = await hashDomain(domain);
    await waitFor(() =>
      expect(openFeature.setContext).toHaveBeenCalledWith({
        targetingKey: "anna@example.ch",
        domain,
        domainHash,
        email: "anna@example.ch",
      }),
    );
  });
});
