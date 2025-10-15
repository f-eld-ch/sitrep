import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Notification from "./Notification";

// Mock useTimeout from usehooks-ts
vi.mock("usehooks-ts", () => ({
  useTimeout: (cb: () => void, delay: number | null) => {
    if (delay !== null && delay !== undefined) {
      setTimeout(cb, delay);
    }
  },
}));

describe("Notification", () => {
  it("renders children and correct class for type", () => {
    render(
      <Notification type="success">
        <span>Success!</span>
      </Notification>,
    );
    expect(screen.getByText("Success!")).toBeInTheDocument();
    expect(screen.getByText("Success!").parentElement).toHaveClass(
      "is-success",
    );
  });

  it("renders correct class for info type", () => {
    render(
      <Notification type="info">
        <span>Info!</span>
      </Notification>,
    );
    expect(screen.getByText("Info!").parentElement).toHaveClass("is-info");
  });

  it("closes when close button is clicked", () => {
    render(
      <Notification type="warning">
        <span>Warning!</span>
      </Notification>,
    );
    const closeButton = screen.getByRole("button");
    fireEvent.click(closeButton);
    expect(screen.queryByText("Warning!")).not.toBeInTheDocument();
  });

  it("auto-dismisses after timeout", async () => {
    vi.useFakeTimers();
    render(
      <Notification type="error" timeout={1000}>
        <span>Error!</span>
      </Notification>,
    );
    expect(screen.getByText("Error!")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText("Error!")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
