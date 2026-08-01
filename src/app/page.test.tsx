import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

// Smoke test proving the React + jsdom rendering harness works.
describe("Home page", () => {
  it("renders the product name", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: "HoldCo OS" }),
    ).toBeInTheDocument();
  });
});
