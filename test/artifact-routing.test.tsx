import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { isSharedArtifactPath } from "../app/artifacts/routes";
import { SideBar } from "../app/components/sidebar";

jest.mock("../app/store", () => ({
  useAccessStore: Object.assign(() => ({}), {
    getState: () => ({ fetch: jest.fn() }),
  }),
  useAppConfig: () => ({
    sidebarWidth: 300,
    dontShowMaskSplashScreen: true,
    update: jest.fn(),
  }),
  useChatStore: () => ({
    currentSessionIndex: 0,
    deleteSession: jest.fn(),
    newSession: jest.fn(),
    nextSession: jest.fn(),
  }),
}));

jest.mock("../app/mcp/actions", () => ({
  initializeMcpSystem: jest.fn(),
  isMcpEnabled: jest.fn(() => new Promise(() => {})),
}));

jest.mock("../app/config/client", () => ({
  getClientConfig: jest.fn(() => ({})),
}));

jest.mock("next/dynamic", () => () => () => null);

function MockIcon() {
  return <svg />;
}

jest.mock("../app/icons/settings.svg", () => MockIcon);
jest.mock("../app/icons/github.svg", () => MockIcon);
jest.mock("../app/icons/add.svg", () => MockIcon);
jest.mock("../app/icons/delete.svg", () => MockIcon);
jest.mock("../app/icons/mask.svg", () => MockIcon);
jest.mock("../app/icons/drag.svg", () => MockIcon);
jest.mock("../app/icons/discovery.svg", () => MockIcon);
jest.mock("../app/icons/neat.svg", () => MockIcon);
jest.mock("../app/icons/mcp.svg", () => MockIcon);
jest.mock("../app/icons/three-dots.svg", () => MockIcon);
jest.mock("../app/icons/file.svg", () => MockIcon);

function LocationDisplay() {
  return <output>{useLocation().pathname}</output>;
}

test("distinguishes the artifact library from shared artifact pages", () => {
  expect(isSharedArtifactPath("/artifacts")).toBe(false);
  expect(isSharedArtifactPath("/artifacts/share-id")).toBe(true);
});

test("renders one Artifacts sidebar action that navigates to the library", () => {
  render(
    <MemoryRouter>
      <SideBar />
      <LocationDisplay />
    </MemoryRouter>,
  );

  const artifactsButton = screen.getByRole("button", {
    name: "Artifacts",
  });
  expect(artifactsButton).toBeVisible();

  fireEvent.click(artifactsButton);

  expect(screen.getByText("/artifacts")).toBeVisible();
});
