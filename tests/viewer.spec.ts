import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const samplePath = path.resolve("sample.gpx");

test("starts empty and manages an uploaded route", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  const unitSwitch = page.getByRole("switch", { name: "Use imperial units" });
  await expect(unitSwitch).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: "Drop GPX files here" })).toBeVisible();
  await expect(page.getByText("Ready for a route")).toBeVisible();

  await page.getByRole("button", { name: "Collapse controls" }).click();
  await expect(page.getByRole("button", { name: "Expand controls" })).toBeVisible();
  await page.getByRole("button", { name: "Expand controls" }).click();
  await expect(page.getByRole("button", { name: "Collapse controls" })).toBeVisible();

  await page.locator("#fileInput").setInputFiles(samplePath);
  await expect(page.getByText("Speed Compass Route").first()).toBeVisible();
  await expect(page.getByText("1 route loaded")).toBeVisible();
  await expect(page.getByText("817")).toBeVisible();
  await expect(page.getByText("Start time")).toBeVisible();
  await expect(page.getByText("End time")).toBeVisible();
  await expect(page.locator(".time-stat dd")).not.toHaveText(["--", "--"]);
  await expect(page.getByText(/\.\d{2} mi/).first()).toBeVisible();

  const routeColor = page.getByLabel("Change color for Speed Compass Route");
  await routeColor.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "#12ab34";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(routeColor).toHaveValue("#12ab34");

  await unitSwitch.click();
  await expect(page.getByRole("switch", { name: "Use imperial units" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(/\.\d{2} km/).first()).toBeVisible();

  await page.getByRole("button", { name: "2D" }).click();
  await expect(page.getByRole("button", { name: "2D" })).toHaveClass(/active/);
  await page.getByRole("button", { name: "3D" }).click();
  await expect(page.getByRole("button", { name: "3D" })).toHaveClass(/active/);

  await page.getByRole("button", { name: "Hide Speed Compass Route" }).click();
  await expect(page.getByRole("button", { name: "Show Speed Compass Route" })).toBeVisible();
  await page.getByRole("button", { name: "Show Speed Compass Route" }).click();

  await page.getByRole("button", { name: "Remove Speed Compass Route" }).click();
  await expect(page.getByRole("heading", { name: "Drop GPX files here" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("supports loading more than one GPX file", async ({ page }, testInfo) => {
  const sample = await readFile(samplePath);
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles([
    { name: "morning.gpx", mimeType: "application/gpx+xml", buffer: sample },
    { name: "evening.gpx", mimeType: "application/gpx+xml", buffer: sample },
  ]);

  await expect(page.getByText("2 routes loaded")).toBeVisible();
  await expect(page.locator(".route-row")).toHaveCount(2);
  await expect(page.locator(".route-swatch")).toHaveCount(2);
  await expect(page.locator("#cesiumContainer canvas").first()).toBeVisible();
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: testInfo.outputPath("loaded-routes.png"), fullPage: true });
});
