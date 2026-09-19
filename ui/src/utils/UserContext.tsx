import {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";
import type { UserState } from "types";

// Define the initial state
const initialState: UserState = { isLoggedin: false, username: "", email: "", sub: "" };

// Define action types
type UserAction =
  | { type: "LOGIN"; payload: { username: string; email: string; sub: string } }
  | { type: "LOGOUT" };

// Define the reducer function
const userReducer = (state: UserState, action: UserAction): UserState => {
  switch (action.type) {
    case "LOGIN":
      return {
        isLoggedin: true,
        username: action.payload.username,
        email: action.payload.email,
        sub: action.payload.sub,
      };
    case "LOGOUT":
      return {
        isLoggedin: false,
        username: "",
        email: "",
        sub: "",
      };
    default:
      return state;
  }
};

// Create the UserContext with initial state and a dummy dispatch function
const UserContext = createContext<{
  state: UserState;
  dispatch: Dispatch<UserAction>;
}>({
  state: initialState,
  dispatch: () => null,
});

// Create the UserProvider component
const UserProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(userReducer, initialState);

  return (
    <UserContext.Provider value={{ state, dispatch }}>
      <UserInfoFetcher />
      {children}
    </UserContext.Provider>
  );
};

const UserInfoFetcher = () => {
  const { state: userState, dispatch } = useContext(UserContext);
  const setUserStateFromUserinfo = useCallback(() => {
    fetch("/oauth2/userinfo", { credentials: "include" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("unauthenticated");
        }
        return response.json();
      })
      .then((userInfo) => {
        const newUserState = {
          isLoggedin: true,
          email: userInfo.email,
          username: userInfo.user || userInfo.preferredUsername,
          sub: userInfo.sub ?? userInfo.user ?? "",
        };

        // Only update state if it has changed
        if (
          newUserState.isLoggedin !== userState.isLoggedin ||
          newUserState.email !== userState.email ||
          newUserState.username !== userState.username ||
          newUserState.sub !== userState.sub
        ) {
          dispatch({ type: "LOGIN", payload: newUserState });
        }
      })
      .catch(() => {
        if (userState.isLoggedin) {
          dispatch({ type: "LOGOUT" });
        }
      });
  }, [userState, dispatch]);

  useEffect(() => {
    setUserStateFromUserinfo();
    const interval = setInterval(() => {
      setUserStateFromUserinfo();
    }, 30000);

    return () => clearInterval(interval);
  }, [setUserStateFromUserinfo]);

  return null;
};

export { UserContext, UserProvider };
