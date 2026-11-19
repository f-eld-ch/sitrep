import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Spinner from "./Spinner";

describe("Spinner", () => {
  it("shows a spinning, decorative icon", () => {
    const { container } = render(<Spinner />);

    const icon = container.querySelector("svg");
    expect(icon).toHaveClass("fa-spin");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
