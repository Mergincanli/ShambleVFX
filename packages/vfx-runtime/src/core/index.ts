/**
 * The runtime's core: pure TypeScript, no three.js. It works out what to draw; the three.js part draws it.
 */
export { evaluate, stepIndex, shownTime, groupOf, frameFor } from './evaluate';
export type { CameraBasis, EvalContext, EvalResult, UvRect } from './evaluate';
export { resolveTimeline, stepMs, holdSteps, inputPoint, flightPoint, flightDirection, phaseProgress } from './timeline';
export type { EffectInputs, Flight, LayerSpan, PhaseSpan, Timeline } from './timeline';
export { applyControls } from './controls';
export type { ResolvedControls } from './controls';
export { DrawSink, TriBuffer, BLEND_GROUPS, readQuads } from './sink';
export type { BlendGroup, QuadRecord } from './sink';
export { edgeLook } from './draw';
export type { Relation, EdgeLook } from './draw';
export { wordIndex, wordDistanceScale, pickWord } from './words';
export { hash32, random01, hashText } from './random';
export { shotFrame, frameOffset } from './math';
export type { ShotFrame } from './math';
export { EffectPlayer } from './player';
export type { PlayingEffect, EffectLookup } from './player';
