"use client";

import { useEffect, useRef } from "react";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from "pixi.js";

import type {
  StageAnimationEvent,
  StageAnimationPlan,
  StageAttackEvent,
  StageDeathEvent,
  StageDoorOpenEvent,
  StageEquipEvent,
  StageFloatNumberEvent,
  StageHitEvent,
  StageItemTriggerEvent,
  StageMoveEvent,
  StagePickupEvent,
  StageStatusBurstEvent,
} from "./animation";
import type {
  StageDrawList,
  StageSpriteDraw,
} from "./draw-list";
import styles from "./PixiStage.module.css";
import {
  destroyStageTextures,
  ensureStageTextures,
  type StageTextureMap,
} from "./sprite-layer";

type PixiStageCanvasProps = {
  readonly drawList: StageDrawList;
  readonly animationPlan: StageAnimationPlan;
};

const safelyDestroyApplication = (app: Application): void => {
  if (!app.renderer) {
    return;
  }

  try {
    app.destroy(true, { children: true });
  } catch {
    // Half-initialized Pixi apps may throw if ResizePlugin teardown is missing.
  }
};

export default function PixiStageCanvas({
  drawList,
  animationPlan,
}: PixiStageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const texturesRef = useRef<StageTextureMap>(new Map());
  const animationRef = useRef<StageAnimationRuntime>(
    createAnimationRuntime(drawList, animationPlan),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const host = hostRef.current;

    if (host === null) {
      return;
    }

    let cancelled = false;
    const app = new Application();
    appRef.current = app;

    void (async () => {
      await app.init({
        width: drawList.canvasWidth,
        height: drawList.canvasHeight,
        background: 0x030509,
        antialias: false,
        resolution: 1,
        autoDensity: true,
      });

      if (cancelled) {
        safelyDestroyApplication(app);
        return;
      }

      host.replaceChildren(app.canvas);
      const world = new Container();
      worldRef.current = world;
      app.stage.addChild(world);
      paintAnimatedFrame(world, texturesRef.current, animationRef.current);

      const tick = (ticker: { readonly deltaMS: number }) => {
        advanceAnimationRuntime(animationRef.current, ticker.deltaMS);
        paintAnimatedFrame(world, texturesRef.current, animationRef.current);
      };

      app.ticker.add(tick);
    })();

    return () => {
      cancelled = true;
      worldRef.current = null;
      destroyStageTextures(texturesRef.current);
      safelyDestroyApplication(app);
      appRef.current = null;
      host.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    const runtime = animationRef.current;

    updateAnimationRuntime(runtime, drawList, animationPlan);

    if (app === null || world === null) {
      return;
    }

    app.renderer.resize(drawList.canvasWidth, drawList.canvasHeight);
    paintAnimatedFrame(world, texturesRef.current, runtime);
  }, [animationPlan, drawList]);

  return (
    <div
      className={styles.canvasHost}
      ref={hostRef}
      data-testid="pixi-stage-canvas-host"
      aria-hidden="true"
    />
  );
}

type ActiveTimed<Event extends StageAnimationEvent> = {
  readonly event: Event;
  elapsedMs: number;
  readonly durationMs: number;
};

type ActiveHit = ActiveTimed<StageHitEvent> & {
  readonly shakeMs: number;
};

type ActiveDeath = {
  readonly event: StageDeathEvent;
  readonly draw: StageSpriteDraw;
  elapsedMs: number;
  readonly durationMs: number;
};

type ActiveParticle = ActiveTimed<
  | StagePickupEvent
  | StageEquipEvent
  | StageItemTriggerEvent
  | StageDoorOpenEvent
  | StageStatusBurstEvent
>;

type StageAnimationRuntime = {
  drawList: StageDrawList;
  animationPlan: StageAnimationPlan;
  appliedPlan: StageAnimationPlan | null;
  elapsedMs: number;
  moves: ActiveTimed<StageMoveEvent>[];
  attacks: ActiveTimed<StageAttackEvent>[];
  hits: ActiveHit[];
  floats: ActiveTimed<StageFloatNumberEvent>[];
  deaths: ActiveDeath[];
  particles: ActiveParticle[];
};

const createAnimationRuntime = (
  drawList: StageDrawList,
  animationPlan: StageAnimationPlan,
): StageAnimationRuntime => ({
  drawList,
  animationPlan,
  appliedPlan: null,
  elapsedMs: 0,
  moves: [],
  attacks: [],
  hits: [],
  floats: [],
  deaths: [],
  particles: [],
});

const updateAnimationRuntime = (
  runtime: StageAnimationRuntime,
  drawList: StageDrawList,
  animationPlan: StageAnimationPlan,
): void => {
  if (runtime.drawList === drawList && runtime.animationPlan === animationPlan) {
    return;
  }

  const previousDrawList = runtime.drawList;
  runtime.drawList = drawList;
  runtime.animationPlan = animationPlan;

  if (runtime.appliedPlan === animationPlan) {
    return;
  }

  applyAnimationEvents(runtime, previousDrawList, animationPlan.events);
  runtime.appliedPlan = animationPlan;
};

const applyAnimationEvents = (
  runtime: StageAnimationRuntime,
  previousDrawList: StageDrawList,
  events: readonly StageAnimationEvent[],
): void => {
  for (const event of events) {
    switch (event.kind) {
      case "move":
        if (event.durationMs > 0) {
          runtime.moves.push(timed(event, event.durationMs));
        }
        break;
      case "attack":
        if (event.durationMs > 0) {
          runtime.attacks.push(timed(event, event.durationMs));
        }
        break;
      case "hit":
        runtime.hits.push({
          ...timed(event, Math.max(event.flashMs, event.shakePx > 0 ? 180 : 0)),
          shakeMs: event.shakePx > 0 ? 180 : 0,
        });
        break;
      case "float_number":
        runtime.floats.push(timed(event, event.durationMs));
        break;
      case "death": {
        const draw = previousDrawList.sprites.find(
          (sprite) => sprite.layer === "entity" && sprite.cellKey === event.cellKey,
        );

        if (draw !== undefined && event.durationMs > 0) {
          runtime.deaths.push({
            event,
            draw,
            elapsedMs: 0,
            durationMs: event.durationMs,
          });
        }
        break;
      }
      case "pickup":
      case "equip":
      case "item_trigger":
      case "door_open":
      case "status_burst":
        runtime.particles.push(timed(event, event.durationMs));
        break;
    }
  }
};

const timed = <Event extends StageAnimationEvent>(
  event: Event,
  durationMs: number,
): ActiveTimed<Event> => ({
  event,
  elapsedMs: 0,
  durationMs,
});

const advanceAnimationRuntime = (
  runtime: StageAnimationRuntime,
  deltaMs: number,
): void => {
  const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  runtime.elapsedMs += safeDelta;

  advanceTimed(runtime.moves, safeDelta);
  advanceTimed(runtime.attacks, safeDelta);
  advanceTimed(runtime.hits, safeDelta);
  advanceTimed(runtime.floats, safeDelta);
  advanceTimed(runtime.particles, safeDelta);

  for (const death of runtime.deaths) {
    death.elapsedMs += safeDelta;
  }
  runtime.deaths = runtime.deaths.filter(
    (death) => death.elapsedMs < death.durationMs,
  );
};

const advanceTimed = <Event extends StageAnimationEvent>(
  entries: ActiveTimed<Event>[],
  deltaMs: number,
): void => {
  for (const entry of entries) {
    entry.elapsedMs += deltaMs;
  }

  let writeIndex = 0;
  for (const entry of entries) {
    if (entry.elapsedMs < entry.durationMs) {
      entries[writeIndex] = entry;
      writeIndex += 1;
    }
  }
  entries.length = writeIndex;
};

const paintAnimatedFrame = (
  world: Container,
  textures: StageTextureMap,
  runtime: StageAnimationRuntime,
): void => {
  const drawList = runtime.drawList;
  ensureStageTextures(drawListWithGhostSprites(drawList, runtime), textures);
  clearWorld(world);

  const shake = screenShakeOffset(runtime);
  world.scale.set(drawList.camera.zoom);
  world.position.set(
    drawList.camera.transformX + shake.x,
    drawList.camera.transformY + shake.y,
  );

  const terrainLayer = new Container();
  const wallOverlayLayer = new Graphics();
  const glowLayer = new Graphics();
  const auraLayer = new Graphics();
  const entityLayer = new Container();
  const effectLayer = new Container();
  const effectGraphics = new Graphics();
  const textLayer = new Container();
  const fogLayer = new Graphics();

  for (const sprite of drawList.sprites.filter(
    (entry) => entry.layer === "terrain",
  )) {
    terrainLayer.addChild(spriteForDraw(sprite, textures));
  }

  for (const overlay of drawList.tileOverlays) {
    wallOverlayLayer.rect(overlay.x, overlay.y, overlay.width, overlay.height);
    wallOverlayLayer.fill({
      color: overlay.fillColor,
      alpha: overlay.alpha,
    });
  }

  for (const glow of drawList.glows) {
    glowLayer.circle(glow.x, glow.y, glow.radius);
    glowLayer.fill({ color: glow.fillColor, alpha: glow.alpha });
  }
  paintStairsGlow(glowLayer, drawList, runtime);

  paintStatusAuras(auraLayer, drawList, runtime);

  for (const sprite of drawList.sprites.filter(
    (entry) => entry.layer === "entity",
  )) {
    entityLayer.addChild(spriteForDraw(sprite, textures, runtime));
  }
  paintDeathGhosts(entityLayer, textures, runtime);
  paintParticles(effectGraphics, drawList, runtime);
  effectLayer.addChild(effectGraphics);
  paintFloatingNumbers(textLayer, drawList, runtime);
  effectLayer.addChild(textLayer);

  for (const fog of drawList.fog) {
    if (fog.alpha <= 0) {
      continue;
    }

    fogLayer.rect(fog.x, fog.y, fog.width, fog.height);
    fogLayer.fill({ color: fog.fillColor, alpha: fog.alpha });
  }

  world.addChild(terrainLayer);
  world.addChild(wallOverlayLayer);
  world.addChild(glowLayer);
  world.addChild(auraLayer);
  world.addChild(entityLayer);
  world.addChild(effectLayer);
  world.addChild(fogLayer);
};

const spriteForDraw = (
  draw: StageSpriteDraw,
  textures: ReadonlyMap<string, Texture>,
  runtime?: StageAnimationRuntime,
): Sprite => {
  const texture = textures.get(draw.atlasKeyString);

  if (texture === undefined) {
    throw new Error(`missing texture for ${draw.atlasKeyString}`);
  }

  const sprite = new Sprite({ texture, roundPixels: true });
  const offset = runtime === undefined
    ? { x: 0, y: 0 }
    : spriteOffset(draw, runtime);
  const aura = runtime === undefined
    ? undefined
    : runtime.animationPlan.statusAuras.find(
        (entry) => entry.cellKey === draw.cellKey,
      );
  const hit = runtime === undefined ? undefined : activeHitForCell(draw.cellKey, runtime);

  sprite.x = draw.x + offset.x;
  sprite.y = draw.y + offset.y;
  sprite.width = draw.width;
  sprite.height = draw.height;
  sprite.alpha = draw.alpha;
  sprite.tint =
    hit !== undefined && hit.elapsedMs <= hit.event.flashMs
      ? 0xffffff
      : aura !== undefined && draw.layer === "entity"
        ? mixColor(draw.tint, aura.color, 0.18)
        : draw.tint;

  return sprite;
};

const drawListWithGhostSprites = (
  drawList: StageDrawList,
  runtime: StageAnimationRuntime,
): StageDrawList =>
  runtime.deaths.length === 0
    ? drawList
    : {
        ...drawList,
        sprites: [
          ...drawList.sprites,
          ...runtime.deaths.map((death) => death.draw),
        ],
      };

const spriteOffset = (
  draw: StageSpriteDraw,
  runtime: StageAnimationRuntime,
): { readonly x: number; readonly y: number } => {
  if (draw.layer !== "entity") {
    return { x: 0, y: 0 };
  }

  const movement = movementOffset(draw, runtime);
  const attack = attackOffset(draw, runtime);
  const idle = idleOffset(draw, runtime);

  return {
    x: movement.x + attack.x + idle.x,
    y: movement.y + attack.y + idle.y,
  };
};

const movementOffset = (
  draw: StageSpriteDraw,
  runtime: StageAnimationRuntime,
): { readonly x: number; readonly y: number } => {
  const active = findLast(runtime.moves, (move) => move.event.toCellKey === draw.cellKey);

  if (active === undefined) {
    return { x: 0, y: 0 };
  }

  const progress = easedProgress(active.elapsedMs, active.durationMs);
  const pitch = runtime.drawList.cellSize + runtime.drawList.gap;

  return {
    x: (active.event.from.x - active.event.to.x) * pitch * (1 - progress),
    y: (active.event.from.y - active.event.to.y) * pitch * (1 - progress),
  };
};

const attackOffset = (
  draw: StageSpriteDraw,
  runtime: StageAnimationRuntime,
): { readonly x: number; readonly y: number } => {
  const active = findLast(
    runtime.attacks,
    (attack) => attack.event.sourceCellKey === draw.cellKey,
  );

  if (active === undefined) {
    return { x: 0, y: 0 };
  }

  const event = active.event;
  const progress = normalizedProgress(active.elapsedMs, active.durationMs);
  const dx = Math.sign(event.to.x - event.from.x);
  const dy = Math.sign(event.to.y - event.from.y);
  const lunge = Math.sin(progress * Math.PI) * runtime.drawList.cellSize * 0.18;

  return { x: dx * lunge, y: dy * lunge };
};

const idleOffset = (
  draw: StageSpriteDraw,
  runtime: StageAnimationRuntime,
): { readonly x: number; readonly y: number } => {
  const bobPx = runtime.animationPlan.timings.idleBobPx;

  if (bobPx <= 0 || !shouldIdleBob(draw)) {
    return { x: 0, y: 0 };
  }

  const phase = (stableHash(draw.key) % 628) / 100;
  const y = Math.sin(runtime.elapsedMs / 520 + phase) * bobPx;

  return { x: 0, y };
};

const shouldIdleBob = (draw: StageSpriteDraw): boolean =>
  draw.spriteId.startsWith("actor.") ||
  draw.spriteId.startsWith("enemy.") ||
  draw.spriteId.startsWith("npc.");

const activeHitForCell = (
  cellKey: string,
  runtime: StageAnimationRuntime,
): ActiveHit | undefined =>
  runtime.hits.find(
    (hit) => hit.event.cellKey === cellKey && hit.elapsedMs <= hit.event.flashMs,
  );

const screenShakeOffset = (
  runtime: StageAnimationRuntime,
): { readonly x: number; readonly y: number } => {
  let x = 0;
  let y = 0;

  for (const hit of runtime.hits) {
    if (hit.shakeMs <= 0 || hit.elapsedMs >= hit.shakeMs) {
      continue;
    }

    const progress = normalizedProgress(hit.elapsedMs, hit.shakeMs);
    const falloff = 1 - progress;
    const phase = (stableHash(hit.event.id) % 360) * (Math.PI / 180);
    x += Math.sin(hit.elapsedMs * 0.09 + phase) * hit.event.shakePx * falloff;
    y += Math.cos(hit.elapsedMs * 0.11 + phase) * hit.event.shakePx * falloff * 0.65;
  }

  return { x, y };
};

const paintStairsGlow = (
  graphics: Graphics,
  drawList: StageDrawList,
  runtime: StageAnimationRuntime,
): void => {
  for (const sprite of drawList.sprites) {
    if (sprite.spriteId !== "terrain.stairs_down" || sprite.alpha <= 0) {
      continue;
    }

    const pulse = sine01(runtime.elapsedMs, 900, stableHash(sprite.key));
    graphics.circle(
      sprite.x + sprite.width / 2,
      sprite.y + sprite.height / 2,
      sprite.width * (0.5 + pulse * 0.08),
    );
    graphics.fill({
      color: 0x74d7ff,
      alpha: (0.11 + pulse * 0.06) * sprite.alpha,
    });
  }
};

const paintStatusAuras = (
  graphics: Graphics,
  drawList: StageDrawList,
  runtime: StageAnimationRuntime,
): void => {
  for (const aura of runtime.animationPlan.statusAuras) {
    const bounds = boundsForPosition(aura.position, drawList);
    const pulse = sine01(
      runtime.elapsedMs,
      runtime.animationPlan.timings.auraPulseMs,
      stableHash(`${aura.targetId}:${aura.statuses.join(",")}`),
    );

    graphics.circle(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      bounds.width * (0.42 + pulse * 0.08),
    );
    graphics.fill({ color: aura.color, alpha: 0.08 + pulse * 0.05 });
  }
};

const paintDeathGhosts = (
  layer: Container,
  textures: ReadonlyMap<string, Texture>,
  runtime: StageAnimationRuntime,
): void => {
  for (const death of runtime.deaths) {
    const progress = easedProgress(death.elapsedMs, death.durationMs);
    const sprite = spriteForDraw(death.draw, textures);
    const scale = 1 + progress * 0.1;
    const width = death.draw.width * scale;
    const height = death.draw.height * scale;

    sprite.x = death.draw.x - (width - death.draw.width) / 2;
    sprite.y =
      death.draw.y -
      runtime.drawList.cellSize * 0.22 * progress -
      (height - death.draw.height) / 2;
    sprite.width = width;
    sprite.height = height;
    sprite.alpha = death.draw.alpha * (1 - progress);
    sprite.tint = mixColor(death.draw.tint, 0xffffff, progress * 0.75);
    layer.addChild(sprite);
  }
};

const paintParticles = (
  graphics: Graphics,
  drawList: StageDrawList,
  runtime: StageAnimationRuntime,
): void => {
  for (const particle of runtime.particles) {
    const progress = normalizedProgress(particle.elapsedMs, particle.durationMs);

    switch (particle.event.kind) {
      case "pickup":
        paintSparkles(graphics, drawList, particle.event.position, {
          progress,
          color: 0xffd56a,
          seed: stableHash(particle.event.id),
          count: 7,
        });
        break;
      case "equip":
        paintRing(graphics, drawList, particle.event.position, {
          progress,
          color: 0x9be7ff,
          alpha: 0.22,
        });
        break;
      case "item_trigger":
        paintItemTrigger(graphics, drawList, particle.event, progress);
        break;
      case "door_open":
        paintDoorOpen(graphics, drawList, particle.event.position, progress);
        break;
      case "status_burst":
        paintSparkles(graphics, drawList, particle.event.position, {
          progress,
          color: particle.event.color,
          seed: stableHash(particle.event.id),
          count: 6,
        });
        break;
    }
  }
};

const paintFloatingNumbers = (
  layer: Container,
  drawList: StageDrawList,
  runtime: StageAnimationRuntime,
): void => {
  for (const floating of runtime.floats) {
    const progress = normalizedProgress(floating.elapsedMs, floating.durationMs);
    const bounds = boundsForPosition(floating.event.position, drawList);
    const text = new Text({
      text: floating.event.text,
      style: {
        fontFamily: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        fontSize: Math.max(10, Math.floor(drawList.cellSize * 0.42)),
        fontWeight: "800",
        fill: floating.event.tone === "damage" ? 0xfff0f0 : 0xb8ffd7,
        stroke: { color: 0x020306, width: 2 },
        align: "center",
        letterSpacing: 0,
        padding: 2,
      },
      anchor: 0.5,
      roundPixels: true,
    });

    text.x = bounds.x + bounds.width / 2;
    text.y = bounds.y + bounds.height * 0.22 - drawList.cellSize * 0.42 * progress;
    text.alpha = Math.max(0, 1 - progress);
    layer.addChild(text);
  }
};

const paintItemTrigger = (
  graphics: Graphics,
  drawList: StageDrawList,
  event: StageItemTriggerEvent,
  progress: number,
): void => {
  const color = event.trigger === "throw_hit"
    ? 0xffb15f
    : event.trigger === "quaff"
      ? 0x65f2c2
      : 0xd7c8ff;

  event.positions.forEach((position, index) => {
    paintSparkles(graphics, drawList, position, {
      progress,
      color,
      seed: stableHash(`${event.id}:${index}`),
      count: event.trigger === "throw_hit" ? 4 : 6,
    });
  });
};

const paintDoorOpen = (
  graphics: Graphics,
  drawList: StageDrawList,
  position: { readonly x: number; readonly y: number },
  progress: number,
): void => {
  const bounds = boundsForPosition(position, drawList);
  const alpha = (1 - progress) * 0.24;
  const width = Math.max(2, drawList.cellSize * 0.08);

  graphics.rect(bounds.x, bounds.y, bounds.width, width);
  graphics.fill({ color: 0xffd27d, alpha });
  graphics.rect(bounds.x, bounds.y + bounds.height - width, bounds.width, width);
  graphics.fill({ color: 0xffd27d, alpha });
  graphics.rect(bounds.x, bounds.y, width, bounds.height);
  graphics.fill({ color: 0xffd27d, alpha: alpha * 0.8 });
  graphics.rect(bounds.x + bounds.width - width, bounds.y, width, bounds.height);
  graphics.fill({ color: 0xffd27d, alpha: alpha * 0.8 });
};

const paintSparkles = (
  graphics: Graphics,
  drawList: StageDrawList,
  position: { readonly x: number; readonly y: number },
  options: {
    readonly progress: number;
    readonly color: number;
    readonly seed: number;
    readonly count: number;
  },
): void => {
  const bounds = boundsForPosition(position, drawList);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const fade = 1 - options.progress;

  for (let index = 0; index < options.count; index += 1) {
    const angle = ((options.seed + index * 97) % 628) / 100;
    const distance =
      drawList.cellSize * (0.12 + options.progress * (0.26 + index * 0.015));
    const radius = Math.max(1.3, drawList.cellSize * (0.045 - options.progress * 0.015));

    graphics.circle(
      centerX + Math.cos(angle) * distance,
      centerY + Math.sin(angle) * distance,
      radius,
    );
    graphics.fill({ color: options.color, alpha: fade * 0.72 });
  }
};

const paintRing = (
  graphics: Graphics,
  drawList: StageDrawList,
  position: { readonly x: number; readonly y: number },
  options: {
    readonly progress: number;
    readonly color: number;
    readonly alpha: number;
  },
): void => {
  const bounds = boundsForPosition(position, drawList);

  graphics.circle(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
    bounds.width * (0.32 + options.progress * 0.28),
  );
  graphics.fill({
    color: options.color,
    alpha: options.alpha * (1 - options.progress),
  });
};

const boundsForPosition = (
  position: { readonly x: number; readonly y: number },
  drawList: StageDrawList,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } => ({
  x: drawList.padding + position.x * (drawList.cellSize + drawList.gap),
  y: drawList.padding + position.y * (drawList.cellSize + drawList.gap),
  width: drawList.cellSize,
  height: drawList.cellSize,
});

const normalizedProgress = (elapsedMs: number, durationMs: number): number =>
  durationMs <= 0 ? 1 : clamp(elapsedMs / durationMs, 0, 1);

const easedProgress = (elapsedMs: number, durationMs: number): number => {
  const progress = normalizedProgress(elapsedMs, durationMs);

  return 1 - (1 - progress) ** 3;
};

const sine01 = (elapsedMs: number, periodMs: number, seed: number): number => {
  const phase = ((seed % 628) / 100) + (elapsedMs / periodMs) * Math.PI * 2;

  return 0.5 + Math.sin(phase) * 0.5;
};

const findLast = <Value,>(
  values: readonly Value[],
  predicate: (value: Value) => boolean,
): Value | undefined => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];

    if (value !== undefined && predicate(value)) {
      return value;
    }
  }

  return undefined;
};

const stableHash = (value: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const mixColor = (base: number, overlay: number, amount: number): number => {
  const clamped = clamp(amount, 0, 1);
  const inverse = 1 - clamped;
  const red = Math.round(((base >> 16) & 0xff) * inverse + ((overlay >> 16) & 0xff) * clamped);
  const green = Math.round(((base >> 8) & 0xff) * inverse + ((overlay >> 8) & 0xff) * clamped);
  const blue = Math.round((base & 0xff) * inverse + (overlay & 0xff) * clamped);

  return (red << 16) | (green << 8) | blue;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clearWorld = (world: Container): void => {
  const removed = world.removeChildren();

  for (const child of removed) {
    child.destroy({ children: true });
  }
};
