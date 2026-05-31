import { expect, test } from "vitest";
import { getWindmillConfig } from "./config.js";

test("returns null when any field is missing", () => {
  expect(getWindmillConfig({})).toBeNull();
  expect(
    getWindmillConfig({ WINDMILL_BASE_URL: "https://wm", WINDMILL_TOKEN: "t" }),
  ).toBeNull();
});

test("trims values and strips trailing slashes from the base url", () => {
  const config = getWindmillConfig({
    WINDMILL_BASE_URL: "https://wm.example.com/ ",
    WINDMILL_WORKSPACE: " demo ",
    WINDMILL_TOKEN: " token ",
  });

  expect(config).toEqual({
    baseUrl: "https://wm.example.com",
    workspace: "demo",
    token: "token",
  });
});
