import { act, render, screen } from "@testing-library/react";
import Footer from "./Footer";
import { Provider as FeatureFlagProvider } from "../FeatureFlags";

test("renders learn react link", () => {
  act(() =>
    render(
      <FeatureFlagProvider>
        <Footer />
      </FeatureFlagProvider>,
    ),
  );
  const linkElement = screen.getByText(/F-ELD/i);
  expect(linkElement).toBeInTheDocument();
});
