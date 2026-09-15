import { faHome, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error:", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-6xl font-bold text-fg-muted/30">500</p>
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-fg-muted">{error.message}</p>
        <div className="flex gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded border border-border px-4 py-2 text-sm hover:bg-bg-elevated"
            onClick={() => this.setState({ error: null })}
          >
            <FontAwesomeIcon icon={faRotateRight} />
            Try again
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
            onClick={() => {
              this.setState({ error: null });
              window.location.href = "/";
            }}
          >
            <FontAwesomeIcon icon={faHome} />
            Go home
          </button>
        </div>
      </div>
    );
  }
}
