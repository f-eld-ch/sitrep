import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimelineSlider, type TimelineSliderProps, toLocalInput } from "./TimelineSlider";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { time?: string }) =>
      options?.time ? `${key}:${options.time}` : key,
  }),
}));

const MINUTE = 60_000;
const NOW = new Date(2026, 0, 15, 14, 0, 0).getTime();
const at = (hour: number, minute = 0) => new Date(2026, 0, 15, hour, minute).getTime();

const onAsOfChange = vi.fn();

function renderSlider(props: Partial<TimelineSliderProps> = {}) {
  return render(
    <TimelineSlider
      asOf={undefined}
      onAsOfChange={onAsOfChange}
      start={new Date(at(9))}
      tickTimes={[at(10), at(12)]}
      {...props}
    />,
  );
}

const slider = () => screen.getByRole("slider", { name: "mapTimeline.slider" }) as HTMLInputElement;
const drag = (time: number) => fireEvent.change(slider(), { target: { value: String(time) } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  onAsOfChange.mockClear();
});

afterEach(() => vi.useRealTimers());

describe("TimelineSlider", () => {
  it("is live at the end of the slider, with nothing later to step to", () => {
    renderSlider();

    expect(slider().max).toBe(String(NOW));
    expect(slider().min).toBe(String(at(9)));
    expect(slider().value).toBe(String(NOW));
    expect(screen.getByRole("button", { name: "mapTimeline.live" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "mapTimeline.next" })).toBeDisabled();
  });

  it("shows the point in time when it is not live", () => {
    renderSlider({ asOf: new Date(at(11)) });

    expect(screen.getByText("mapTimeline.asOf:15.01.26 11:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "mapTimeline.live" })).toBeEnabled();
  });

  it("only reports the point in time once the slider is released", () => {
    renderSlider();

    drag(at(11));
    expect(onAsOfChange).not.toHaveBeenCalled();
    // while dragging, the handle follows
    expect(slider().value).toBe(String(at(11)));

    fireEvent.pointerUp(slider());

    expect(onAsOfChange).toHaveBeenCalledWith(new Date(at(11)));
  });

  it.each([
    ["keyboard", (el: HTMLElement) => fireEvent.keyUp(el, { key: "ArrowLeft" })],
    ["blur", (el: HTMLElement) => fireEvent.blur(el)],
  ])("also commits on %s", (_name, release) => {
    renderSlider();
    drag(at(11));

    release(slider());

    expect(onAsOfChange).toHaveBeenCalledWith(new Date(at(11)));
  });

  it("goes live when released at the end", () => {
    renderSlider({ asOf: new Date(at(11)) });
    drag(NOW);

    fireEvent.pointerUp(slider());

    expect(onAsOfChange).toHaveBeenCalledWith(undefined);
  });

  it("reports nothing when released without having moved", () => {
    renderSlider();

    fireEvent.pointerUp(slider());

    expect(onAsOfChange).not.toHaveBeenCalled();
  });

  it("steps back to the previous tick and on to the next", () => {
    renderSlider({ asOf: new Date(at(11)) });

    fireEvent.click(screen.getByRole("button", { name: "mapTimeline.previous" }));
    expect(onAsOfChange).toHaveBeenLastCalledWith(new Date(at(10)));

    fireEvent.click(screen.getByRole("button", { name: "mapTimeline.next" }));
    expect(onAsOfChange).toHaveBeenLastCalledWith(new Date(at(12)));
  });

  it("goes live when stepping past the last tick", () => {
    renderSlider({ asOf: new Date(at(12)) });

    fireEvent.click(screen.getByRole("button", { name: "mapTimeline.next" }));

    expect(onAsOfChange).toHaveBeenCalledWith(undefined);
  });

  it("cannot step back before the first tick", () => {
    renderSlider({ asOf: new Date(at(10)) });

    expect(screen.getByRole("button", { name: "mapTimeline.previous" })).toBeDisabled();
  });

  it("goes live with the live button", () => {
    renderSlider({ asOf: new Date(at(11)) });

    fireEvent.click(screen.getByRole("button", { name: "mapTimeline.live" }));

    expect(onAsOfChange).toHaveBeenCalledWith(undefined);
  });

  it("cannot be scrubbed when there is nothing before now", () => {
    renderSlider({ start: undefined, tickTimes: [] });

    expect(slider()).toBeDisabled();
  });

  it("lets the end of the slider follow the clock while live", () => {
    renderSlider();

    act(() => {
      vi.setSystemTime(NOW + 10 * MINUTE);
      vi.advanceTimersByTime(30_000);
    });

    expect(slider().max).toBe(String(NOW + 10 * MINUTE + 30_000));
  });

  it("keeps the end of the slider still while looking at the past", () => {
    renderSlider({ asOf: new Date(at(11)) });

    act(() => {
      vi.setSystemTime(NOW + 10 * MINUTE);
      vi.advanceTimersByTime(60_000);
    });

    expect(slider().max).toBe(String(NOW));
  });

  it("shows extra content next to the label", () => {
    renderSlider({ footerExtra: <span>Optionen</span> });

    expect(screen.getByText("Optionen")).toBeInTheDocument();
  });
});

describe("toLocalInput", () => {
  it("formats a date for a datetime-local input in local time", () => {
    expect(toLocalInput(new Date(2026, 0, 5, 9, 7))).toBe("2026-01-05T09:07");
  });
});
