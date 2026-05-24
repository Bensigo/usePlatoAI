import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AvatarRenderer,
  avatarAnimationCommands,
  avatarCompanionStates,
  avatarEyeDirectionFromCursor,
  avatarEyeDirectionNeutral,
  avatarEyeDirectionStyle,
  avatarIdleWavePolicy,
  avatarLaunchSequence,
  avatarPackageAssets,
  avatarStartupSound,
  fallbackRendererFor,
  getAvatarRendererConfig,
  millisecondsUntilNextAvatarIdleWave,
  mascotSource,
  vendoredRiveAssetContract,
} from "../src";

function vendoredRiveContractNames() {
  const riveAsset = readFileSync(
    resolve(__dirname, "../assets/rive/plato-companion.riv"),
    "latin1",
  );
  const rawNames = riveAsset.match(/[A-Za-z][A-Za-z0-9 _-]{1,40}/g) ?? [];
  const names = new Set(rawNames);

  for (const name of rawNames) {
    names.add(name.replace(/\d+$/, ""));
  }

  return names;
}

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
      "listening",
      "happy",
      "sad",
      "talking",
      "celebrating",
    ]);
    expect(avatarAnimationCommands).toEqual([
      "startup.appear",
      "greet.wave",
      "idle.breathe",
      "voice.listen",
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
      expect(config.rive.artboard).toBe("Avatar 1");
      expect(config.rive.stateMachine).toBe("avatar");
      expect(config.rive.animation).toMatch(/^[a-z]+/);
      expect(config.fallback.renderer).toBe("svg");
      expect(config.fallback.src).toBe("/avatar/plato/source/wise-owl-colour.svg");
    }
  });

  it("keeps the renderer config aligned with the vendored Rive asset contract", () => {
    const riveContractNames = vendoredRiveContractNames();

    for (const state of avatarCompanionStates) {
      const config = getAvatarRendererConfig(state);

      expect(riveContractNames).toContain(config.rive.artboard);
      expect(riveContractNames).toContain(config.rive.stateMachine);
      expect(riveContractNames).toContain(config.rive.animation);

      for (const inputName of Object.keys(config.rive.inputs)) {
        expect(riveContractNames).toContain(inputName);
      }
    }
  });

  it("documents the vendored Rive asset contract used by renderer config", () => {
    expect(vendoredRiveAssetContract).toEqual({
      artboard: "Avatar 1",
      stateMachine: "avatar",
      animations: {
        idle: "idle",
        happy: "happy",
        sad: "sad",
      },
      inputs: {
        isHappy: "isHappy",
        isSad: "isSad",
        mouth: "mouth",
      },
    });
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

  it("maps cursor position into a clamped avatar eye direction", () => {
    const avatarBounds = {
      left: 100,
      top: 200,
      width: 200,
      height: 240,
    };

    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 200,
        cursorY: 200 + 240 * 0.42,
        avatarBounds,
      }),
    ).toEqual(avatarEyeDirectionNeutral);
    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 274,
        cursorY: 200 + 240 * 0.42 + 69.6,
        avatarBounds,
      }),
    ).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("clamps eye direction at the avatar package boundary", () => {
    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 10_000,
        cursorY: -10_000,
        avatarBounds: {
          left: 100,
          top: 200,
          width: 200,
          height: 240,
        },
      }),
    ).toEqual({
      x: 1,
      y: -1,
    });
    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 100,
        cursorY: 100,
        avatarBounds: {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
        },
      }),
    ).toEqual(avatarEyeDirectionNeutral);
    expect(avatarEyeDirectionStyle({ x: 0.25, y: -0.5 })).toEqual({
      "--plato-avatar-eye-x": 0.25,
      "--plato-avatar-eye-y": -0.5,
    });
  });

  it("represents startup sound ownership in the avatar package API", () => {
    expect(avatarStartupSound).toEqual({
      id: "plato-startup-chime",
      packagePath: "packages/avatar/assets/audio/plato-startup-chime.wav",
      publicPath: "/avatar/plato/audio/plato-startup-chime.wav",
      playback: "app-launch-or-activation",
      durationMs: 960,
      format: "audio/wav",
      source: "generated-useplatoai",
    });
  });

  it("owns the launch wave sequence through avatar product commands", () => {
    expect(avatarLaunchSequence).toEqual([
      {
        delayMs: 0,
        presenceState: "appearing",
        companionState: "startup",
        command: "startup.appear",
      },
      {
        delayMs: 560,
        presenceState: "listening",
        companionState: "greet",
        command: "greet.wave",
      },
      {
        delayMs: 1520,
        presenceState: "idle",
        companionState: "idle",
        command: "idle.breathe",
      },
    ]);
  });

  it("defines a rate-limited idle wave policy that backs off outside idle", () => {
    expect(avatarIdleWavePolicy).toMatchObject({
      companionState: "greet",
      command: "greet.wave",
      initialDelayMs: 8_500,
      minimumIntervalMs: 18_000,
      activeStateBackoffMs: 6_000,
      waveDurationMs: 960,
    });
    expect(avatarIdleWavePolicy.pausedPresenceStates).toContain("focused");
    expect(avatarIdleWavePolicy.pausedPresenceStates).toContain("sleeping");
    expect(avatarIdleWavePolicy.pausedPresenceStates).toContain("task_running");

    expect(
      millisecondsUntilNextAvatarIdleWave({
        presenceState: "idle",
        nowMs: 1_000,
        lastWaveAtMs: null,
      }),
    ).toBe(avatarIdleWavePolicy.initialDelayMs);
    expect(
      millisecondsUntilNextAvatarIdleWave({
        presenceState: "idle",
        nowMs: 10_000,
        lastWaveAtMs: 1_000,
      }),
    ).toBe(9_000);
    expect(
      millisecondsUntilNextAvatarIdleWave({
        presenceState: "focused",
        nowMs: 10_000,
        lastWaveAtMs: 1_000,
      }),
    ).toBe(avatarIdleWavePolicy.activeStateBackoffMs);
  });

  it("renders a Rive-backed React entrypoint with the sourced mascot fallback", () => {
    const markup = renderToStaticMarkup(
      <AvatarRenderer companionState="greet" />,
    );

    expect(markup).toContain('data-avatar-package="@useplatoai/avatar"');
    expect(markup).toContain('data-avatar-renderer="rive"');
    expect(markup).toContain('data-rive-runtime-state="loading"');
    expect(markup).toContain('data-rive-artboard="Avatar 1"');
    expect(markup).toContain('data-rive-state-machine="avatar"');
    expect(markup).toContain('data-rive-animation="happy"');
    expect(markup).toContain('data-rive-input-is-happy="true"');
    expect(markup).toContain('data-rive-input-is-sad="false"');
    expect(markup).toContain('data-avatar-eye-tracking="rive-matched-pupils"');
    expect(markup).toContain('data-rive-eye-surface="Avatar 1"');
    expect(markup).toContain("plato-rive-eye-tracking-overlay");
    expect(markup).toContain("plato-rive-eye-pupil-left");
    expect(markup).toContain("plato-rive-eye-pupil-right");
    expect(markup).toContain('data-avatar-eye-tracking="fallback-svg-pupils"');
    expect(markup).toContain('data-avatar-eye-x="0"');
    expect(markup).toContain('data-avatar-eye-y="0"');
    expect(markup).not.toContain('data-avatar-eye-tracking="source-svg-pupils"');
    expect(markup).not.toContain('data-avatar-eye-tracking="fallback-overlay"');
    expect(markup).not.toContain("plato-avatar-eye-left");
    expect(markup).not.toContain("plato-avatar-eye-right");
    expect(markup).toContain('data-fallback-renderer="svg"');
    expect(markup).toContain('data-avatar-fallback-state="visible"');
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
