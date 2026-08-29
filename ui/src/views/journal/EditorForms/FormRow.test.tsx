import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormRow } from "./FormRow";

describe("FormRow", () => {
  it("label is associated to the child input via htmlFor/id", () => {
    const { getByLabelText } = render(
      <FormRow label="callsign">{(id) => <input id={id} type="text" />}</FormRow>,
    );
    expect(getByLabelText("callsign").tagName).toBe("INPUT");
  });

  it("renders no label element when label is omitted", () => {
    const { container } = render(<FormRow>{() => <button type="submit">save</button>}</FormRow>);
    expect(container.querySelector("label")).toBeNull();
  });

  it("adds is-grouped class when grouped=true", () => {
    const { container } = render(
      <FormRow label="x" grouped>
        {(id) => <input id={id} type="text" />}
      </FormRow>,
    );
    expect(container.querySelector(".field.is-grouped")).not.toBeNull();
  });
});
