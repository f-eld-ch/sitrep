import { createContext } from "react";
import { UserState } from "types";
const UserContext = createContext<UserState>({ isLoggedin: false, username: "", email: "" });

export { UserContext };
