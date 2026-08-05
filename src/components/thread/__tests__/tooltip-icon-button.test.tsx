// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import React, { useState } from "react";
import { TooltipIconButton } from "../tooltip-icon-button";

describe("TooltipIconButton", () => {
  it("renders without crashing", () => {
    const { getByRole } = render(
      <TooltipIconButton tooltip="Test">Click me</TooltipIconButton>,
    );
    expect(getByRole("button")).toBeTruthy();
  });

  it("does not crash when parent re-renders rapidly", () => {
    // This test catches the Radix Tooltip ref update loop crash.
    // Before the fix, TooltipTrigger asChild caused "Maximum update depth exceeded"
    // when the parent re-rendered (e.g., during thread switching).

    function RapidRerenderParent() {
      const [count, setCount] = useState(0);

      // Simulate rapid re-renders like thread switching causes
      if (count < 20) {
        setCount((c) => c + 1);
      }

      return (
        <TooltipIconButton tooltip="Test button">
          <span>Icon</span>
        </TooltipIconButton>
      );
    }

    // This should NOT throw "Maximum update depth exceeded"
    expect(() => {
      render(<RapidRerenderParent />);
    }).not.toThrow();
  });

  it("renders with title attribute for tooltip", () => {
    const { getAllByRole } = render(
      <TooltipIconButton tooltip="My tooltip">X</TooltipIconButton>,
    );
    const buttons = getAllByRole("button");
    expect(buttons[0].getAttribute("title")).toBe("Test");
  });

  it("forwards ref correctly", () => {
    const ref = { current: null };
    render(
      <TooltipIconButton tooltip="Test" ref={ref as React.Ref<HTMLButtonElement>}>
        X
      </TooltipIconButton>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("handles rapid mount/unmount without crashing", () => {
    // Simulate thread switching: mount, unmount, mount different tooltip
    function Switcher() {
      const [show, setShow] = useState(true);
      return (
        <div>
          <button onClick={() => setShow((s) => !s)}>toggle</button>
          {show && (
            <TooltipIconButton tooltip="First">
              <span>A</span>
            </TooltipIconButton>
          )}
          {!show && (
            <TooltipIconButton tooltip="Second">
              <span>B</span>
            </TooltipIconButton>
          )}
        </div>
      );
    }

    const { getByRole } = render(<Switcher />);
    const toggle = getByRole("button", { name: "toggle" });

    // Rapidly toggle — should not crash
    expect(() => {
      act(() => {
        toggle.click();
        toggle.click();
        toggle.click();
        toggle.click();
        toggle.click();
      });
    }).not.toThrow();
  });
});
