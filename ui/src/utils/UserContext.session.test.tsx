import { act, cleanup, render, screen } from "@testing-library/react";
import { useContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserContext, UserProvider } from "./UserContext";

function Probe() {
  const { state } = useContext(UserContext);
  return (
    <div>
      <span data-testid="isLoggedin">{state.isLoggedin ? "true" : "false"}</span>
      <span data-testid="username">{state.username}</span>
      <span data-testid="email">{state.email}</span>
      <span data-testid="sub">{state.sub}</span>
    </div>
  );
}

const userinfo = (body: unknown, ok = true) =>
  ({ ok, json: () => Promise.resolve(body) }) as unknown as Response;

const settle = () => act(async () => vi.advanceTimersByTimeAsync(0));

const renderProvider = () =>
  render(
    <UserProvider>
      <Probe />
    </UserProvider>,
  );

const text = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("UserProvider session lookup", () => {
  it("logs in with the user info of the session cookie", async () => {
    vi.mocked(fetch).mockResolvedValue(
      userinfo({ user: "alice", email: "alice@example.org", sub: "sub-1" }),
    );
    renderProvider();
    await settle();
    expect(fetch).toHaveBeenCalledWith("/oauth2/userinfo", { credentials: "include" });
    expect(text("isLoggedin")).toBe("true");
    expect(text("username")).toBe("alice");
    expect(text("email")).toBe("alice@example.org");
    expect(text("sub")).toBe("sub-1");
  });

  it("falls back to the preferred username when there is no user", async () => {
    vi.mocked(fetch).mockResolvedValue(
      userinfo({ preferredUsername: "bob", email: "bob@example.org" }),
    );
    renderProvider();
    await settle();
    expect(text("username")).toBe("bob");
  });

  it("uses the user as subject when the user info has none", async () => {
    vi.mocked(fetch).mockResolvedValue(userinfo({ user: "alice", email: "a@example.org" }));
    renderProvider();
    await settle();
    expect(text("sub")).toBe("alice");
  });

  it("has an empty subject when there is neither a subject nor a user", async () => {
    vi.mocked(fetch).mockResolvedValue(userinfo({ preferredUsername: "bob", email: "b@e.org" }));
    renderProvider();
    await settle();
    expect(text("isLoggedin")).toBe("true");
    expect(text("sub")).toBe("");
  });

  it("stays logged out when the session is not authenticated", async () => {
    vi.mocked(fetch).mockResolvedValue(userinfo({}, false));
    renderProvider();
    await settle();
    expect(text("isLoggedin")).toBe("false");
  });

  it("stays logged out when the request fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    renderProvider();
    await settle();
    expect(text("isLoggedin")).toBe("false");
  });

  it("asks again every 30 seconds and logs out once the session is gone", async () => {
    vi.mocked(fetch).mockResolvedValue(userinfo({ user: "alice", email: "a@example.org" }));
    renderProvider();
    await settle();
    expect(text("isLoggedin")).toBe("true");
    // logging in changes the state the lookup depends on, which looks the session up again
    const callsAfterLogin = vi.mocked(fetch).mock.calls.length;

    vi.mocked(fetch).mockResolvedValue(userinfo({}, false));
    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(fetch).toHaveBeenCalledTimes(callsAfterLogin);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    // the poll, plus the look-up that logging out triggers in turn
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callsAfterLogin);
    expect(text("isLoggedin")).toBe("false");
    expect(text("username")).toBe("");
  });

  it("stops asking once unmounted", async () => {
    vi.mocked(fetch).mockResolvedValue(userinfo({}, false));
    const { unmount } = renderProvider();
    await settle();
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
