import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AvatarRenderer,
  avatarAnimationCommands,
  avatarCompanionStates,
  avatarPackageAssets,
  avatarStartupSound,
  fallbackRendererFor,
  getAvatarRendererConfig,
  mascotSource,
} from "../src";

describe("avatar package contract", () => {
  it("documents the commercial-safe mascot source and local shippable assets", () => {
    expect(mascotSource.title).toBe("Wise Owl - Colour");
    expect(mascotSource.license.spdxId).toBe("CC0-1.0");
    expect(mascotSource.license.allowsCommercialUse).toBe(true);
    expect(mascotSource.attribution.required).toBe(false);
    expect(mascotSource.sourceUrl).toBe(
      "https://openclipart.org/detail/303927/wise-owl-colour",
    );

    for (const asset of Object.values(avatarPackageAssets)) {
      expect(asset.packagePath.startsWith("packages/avatar/")).toBe(true);
      expect(existsSync(resolve(__dirname, "../../..", asset.packagePath))).toBe(
        true,
      );
    }
  });

  it("exports companion states and animation commands required by the milestone slice", () => {
    expect(avatarCompanionStates).toEqual([
      "startup",
      "greet",
      "idle",
      "happy",
      "sad",
      "talking",
      "celebrating",
    ]);
    expect(avatarAnimationCommands).toEqual([
      "startup.appear",
      "greet.wave",
      "idle.breathe",
      "mood.smile",
      "mood.sad",
      "voice.talk",
      "celebration.dance",
    ]);
  });

  it("maps every companion state to a Rive-first renderer config and secondary fallback", () => {
    for (const state of avatarCompanionStates) {
      const config = getAvatarRendererConfig(state);

      expect(config.primaryRenderer).toBe("rive");
      expect(config.rive.src).toBe("/avatar/plato/rive/plato-companion.riv");
      expect(config.rive.stateMachine).toBe("Plato Companion");
      expect(config.rive.animation).toMatch(/^[a-z]+/);
      expect(config.fallback.renderer).toBe("svg");
      expect(config.fallback.src).toBe("/avatar/plato/source/wise-owl-colour.svg");
    }
  });

  it("keeps renderer fallback behavior explicit instead of replacing Rive", () => {
    expect(fallbackRendererFor("missing-rive-asset")).toEqual({
      renderer: "svg",
      reason: "missing-rive-asset",
      src: "/avatar/plato/source/wise-owl-colour.svg",
    });
    expect(fallbackRendererFor("unsupported-runtime")).toEqual({
      renderer: "svg",
      reason: "unsupported-runtime",
      src: "/avatar/plato/source/wise-owl-colour.svg",
    });
  });

  it("represents startup sound ownership in the avatar package API", () => {
    expect(avatarStartupSound).toEqual({
      id: "plato-startup-chime",
      packagePath: "packages/avatar/assets/audio/plato-startup-chime.json",
      publicPath: "/avatar/plato/audio/plato-startup-chime.json",
      playback: "user-activated",
    });
  });

  it("renders a Rive-backed React entrypoint with the sourced mascot fallback", () => {
    const markup = renderToStaticMarkup(
      <AvatarRenderer companionState="greet" />,
    );

    expect(markup).toContain('data-avatar-package="@useplatoai/avatar"');
    expect(markup).toContain('data-avatar-renderer="rive"');
    expect(markup).toContain('data-rive-state-machine="Plato Companion"');
    expect(markup).toContain('data-rive-animation="wave"');
    expect(markup).toContain('data-fallback-renderer="svg"');
    expect(markup).toContain("/avatar/plato/rive/plato-companion.riv");
    expect(markup).toContain("/avatar/plato/source/wise-owl-colour.svg");
  });

  it("ships a source SVG, not only a desktop-local PNG", () => {
    const sourceSvg = readFileSync(
      resolve(__dirname, "../assets/source/wise-owl-colour.svg"),
      "utf8",
    );

    expect(sourceSvg).toContain("<svg");
    expect(sourceSvg).toContain("plato-wise-owl");
  });
});
