import { render, screen } from "@testing-library/react";
import Footer from "./Footer";

test("renders learn react link", () => {
  render(<Footer />);
  const linkElement = screen.getByText(/F-ELD/i);
  expect(linkElement).toBeInTheDocument();
});
