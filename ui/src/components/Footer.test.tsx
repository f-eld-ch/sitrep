import { act, render, screen } from "@testing-library/react";
import { Provider as FeatureFlagProvider } from "../FeatureFlags";
import Footer from "./Footer";

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
