/**
 * The runtime's core: pure TypeScript, no three.js. It works out what to draw; the three.js part draws it.
 */
export { evaluate, stepIndex, shownTime } from './evaluate';
export type { CameraBasis, EvalContext, EvalResult, UvRect } from './evaluate';
export { resolveTimeline, stepMs, holdSteps, inputPoint } from './timeline';
export type { EffectInputs, LayerSpan, Timeline } from './timeline';
export { applyControls } from './controls';
export type { ResolvedControls } from './controls';
export { QuadSink } from './sink';
export type { QuadRecord } from './sink';
export { hash32, random01, hashText } from './random';
export { shotFrame, frameOffset } from './math';
export type { ShotFrame } from './math';
export { EffectPlayer } from './player';
export type { PlayingEffect, EffectLookup } from './player';
