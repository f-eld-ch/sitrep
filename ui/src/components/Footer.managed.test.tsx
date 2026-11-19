import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import Footer from "./Footer";

vi.mock("@openfeature/react-sdk", () => ({ useBooleanFlagValue: vi.fn() }));

describe("Footer", () => {
  beforeEach(() => {
    vi.mocked(useBooleanFlagValue).mockReset();
  });

  it("asks for the managed flag with a default of off", () => {
    vi.mocked(useBooleanFlagValue).mockReturnValue(false);
    render(<Footer />);

    expect(useBooleanFlagValue).toHaveBeenCalledWith("is-sitrep-managed", false);
  });

  it("links the project and its maintainers", () => {
    vi.mocked(useBooleanFlagValue).mockReturnValue(false);
    render(<Footer />);

    expect(screen.getByRole("link", { name: "SitRep on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/f-eld-ch/sitrep",
    );
    expect(screen.getByRole("link", { name: "F-ELD" })).toHaveAttribute(
      "href",
      "https://www.f-eld.ch",
    );
  });

  it("credits the hosting provider only for a managed installation", () => {
    vi.mocked(useBooleanFlagValue).mockReturnValue(false);
    const { unmount } = render(<Footer />);
    expect(screen.queryByRole("link", { name: "VSHN" })).not.toBeInTheDocument();
    unmount();

    vi.mocked(useBooleanFlagValue).mockReturnValue(true);
    render(<Footer />);
    expect(screen.getByRole("link", { name: "VSHN" })).toHaveAttribute(
      "href",
      "https://www.vshn.ch",
    );
  });
});
