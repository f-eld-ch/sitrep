import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import type { ApiError } from "api";

/**
 * Redirects the user away from a page they are not authorized to see.
 * Goes back to the previous route when one exists in this router's history,
 * otherwise falls back to the incident list.
 */
export function useRedirectIfForbidden(error: ApiError | undefined) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (error?.code !== "FORBIDDEN") return;

    if (location.key === "default") {
      navigate("/", { replace: true });
    } else {
      navigate(-1);
    }
  }, [error, navigate, location.key]);
}
