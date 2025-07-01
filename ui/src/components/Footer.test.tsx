import { render, screen } from "@testing-library/react";
import { Provider as FeatureFlagProvider } from "../FeatureFlags";
import Footer from "./Footer";

test("renders learn react link", async () => {
  render(
    <FeatureFlagProvider>
      <Footer />
    </FeatureFlagProvider>,
  );
  const linkElement = await screen.findByText(/F-ELD/i);
  expect(linkElement).toBeInTheDocument();
});
