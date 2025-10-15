import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useContext } from "react";
import { describe, expect, it } from "vitest";
import { UserContext, UserProvider } from "./UserContext";

function TestComponent() {
  const { state, dispatch } = useContext(UserContext);
  return (
    <div>
      <span data-testid="username">{state.username}</span>
      <span data-testid="email">{state.email}</span>
      <span data-testid="isLoggedin">
        {state.isLoggedin ? "true" : "false"}
      </span>
      <button
        type="button"
        onClick={() =>
          dispatch({
            type: "LOGIN",
            payload: { username: "foo", email: "foo@bar.com" },
          })
        }
      >
        Login
      </button>
      <button type="button" onClick={() => dispatch({ type: "LOGOUT" })}>
        Logout
      </button>
    </div>
  );
}

describe("UserContext", () => {
  it("provides default state", () => {
    render(
      <UserProvider>
        <TestComponent />
      </UserProvider>,
    );
    expect(screen.getByTestId("isLoggedin").textContent).toBe("false");
    expect(screen.getByTestId("username").textContent).toBe("");
    expect(screen.getByTestId("email").textContent).toBe("");
  });

  it("updates state on LOGIN action", async () => {
    render(
      <UserProvider>
        <TestComponent />
      </UserProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText("Login"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("isLoggedin").textContent).toBe("true");
      expect(screen.getByTestId("username").textContent).toBe("foo");
      expect(screen.getByTestId("email").textContent).toBe("foo@bar.com");
    });
  });

  it("resets state on LOGOUT action", () => {
    render(
      <UserProvider>
        <TestComponent />
      </UserProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText("Login"));
      fireEvent.click(screen.getByText("Logout"));
    });
    expect(screen.getByTestId("isLoggedin").textContent).toBe("false");
    expect(screen.getByTestId("username").textContent).toBe("");
    expect(screen.getByTestId("email").textContent).toBe("");
  });
});
