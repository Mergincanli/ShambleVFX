/**
 * Tooltips for the editor's labels: what each setting does and how to use it, in plain words (F4).
 *
 * Every text was written against the code that uses the setting (vfx-runtime/src/core, vfx-format's types and checker,
 * the editor's inspector, specform and cost card). Where the meaning of a label changes with the layer type, the shape
 * kind or the section, the entry has variants; the first variant that fits wins, and the default text is true (or at
 * least neutral) wherever the label appears.
 *
 * How to use it:
 *   helpFor('Width', { section: 'Shape: ring', layer: 'shape', kind: 'ring' })
 *   helpFor('Colour', { section: ['Pieces', 'Speed streak'], layer: 'burst' })
 *   helpFor('Rings closing in', { title: true, section: 'Shape: ring', kind: 'ring' })   // a fold's own title
 *   helpFor('Speed', { section: 'Transport' })                                            // the bars: see BAR_SECTIONS
 *   shortcutFor('Fire')                                                                   // 'F', for the tooltip's kbd
 *
 * - `section` is the section the label sits in, as shown: its title, a path of titles from the outside in
 *   ("Pieces > Speed streak") or a list. Only the innermost title is matched; a "Shape: <kind>" title anywhere in the path
 *   also gives the shape kind. For a section's own title (the summary of a fold), pass `title: true`, and as `section`
 *   the sections around it (its parents), not the title itself.
 * - Labels are matched exactly, case included ("Life" is a piece's life, "life" the curve under Animation). The
 *   settings inventory's names for the second and third box of a pair or three ("Width (2)") give the first box's
 *   text, which covers every box of the row: the editor shows those boxes with "…" or no label, so ask with the first.
 *   "Tone 5", a bare tone number ("3"), "Checks: 2 problems", "Pause", "＋ Add…" and "Measure again" are understood.
 * - Shortcuts are not in the texts: shortcutFor() gives them, for the tooltip's own kbd.
 * - "Look" is two things: the pieces' look (a fold in Pieces: pass section "Pieces") and, from this round (F2), the live
 *   picture at the top of a layer's panel (a title with no section round it). This round's other new labels ("Fade other
 *   layers", "Show all", "Layers riding it") come from NEW_LABELS; NEW_THIS_ROUND has texts for lines with no label.
 */

export type LayerType = 'sprite' | 'projectile' | 'shape' | 'burst' | 'word';
export type ShapeKind =
  | 'shards' | 'flash' | 'cloud' | 'smoke' | 'ring' | 'dots' | 'scorch' | 'lines' | 'glow' | 'trail' | 'band' | 'beads'
  | 'flames' | 'bed';

const SHAPE_KINDS: readonly ShapeKind[] = ['shards', 'flash', 'cloud', 'smoke', 'ring', 'dots', 'scorch', 'lines', 'glow', 'trail', 'band', 'beads', 'flames', 'bed'];

/** The bars have no section titles of their own: pass one of these as the section of a bar's control. */
export const BAR_SECTIONS = ['Top bar', 'Preview bar', 'Transport', 'Effects', 'Layers'] as const;
export type BarSection = (typeof BAR_SECTIONS)[number];

/** Where a label is shown. */
export interface HelpWhere {
  /** The section it sits in: a title, a path such as "Shape: ring > Rings closing in", or a list from the outside in. */
  section?: string | readonly string[];
  /** The selected layer's type. Leave it out in the effect's own view and for the bars. */
  layer?: LayerType;
  /** The shape kind, for a shape layer. */
  kind?: ShapeKind;
  /** The label is a section's own title (a fold's summary); `section` then names the sections around it. */
  title?: boolean;
}

/** One meaning of a label, and where it applies. Every condition given must hold. */
export interface HelpVariant {
  text: string;
  /** Only for a section's own title. */
  title?: true;
  /** The innermost section title (or one of these). */
  in?: string | readonly string[];
  layer?: LayerType | readonly LayerType[];
  kind?: ShapeKind | readonly ShapeKind[];
}

export interface HelpEntry {
  /** True, or neutral, wherever the label appears. */
  text: string;
  /** Checked in order; the first that fits wins. */
  when?: readonly HelpVariant[];
}

const PX = 'px on a 1080p screen';

/**
 * The texts, keyed by the label exactly as the editor shows it. Section titles and field labels share the table: a
 * title and a field with the same words get variants.
 */
export const HELP: Readonly<Record<string, string | HelpEntry>> = {
  // ------------------------------------------------------------ the effect's own view
  'Effect': 'The whole effect: its name, the game events that start it, the four big controls (Size, Intensity, Duration, Colour) and its phases.',
  'Effect name': 'The effect\'s name in the editor. Its file keeps its own id, so you can rename it freely.',
  'Game events it answers': 'The names the game starts this effect by, such as rifle.shot, with commas between. One event plays one effect; the names are proposals until the game settles them.',
  'Size': {
    text: 'How big it is, in the unit shown.',
    when: [
      { in: ['Effect', 'Scale'], text: 'Makes the whole effect bigger or smaller: sprites, shapes, pieces, words and offsets. Line widths in px, the origin, the target and flight speeds stay; 1 = as made.' },
      { in: 'Pieces', text: 'Each piece\'s size in metres, picked per piece between the two numbers, such as 0.08 to 0.12. It grows with the Size control.' },
      { layer: 'burst', text: 'Each piece\'s size in metres, picked per piece between the two numbers, such as 0.08 to 0.12. It grows with the Size control.' },
      { kind: 'beads', text: 'How big each bead is, in metres, such as 0.24.' },
    ],
  },
  'Intensity': 'Sprites at the origin or target grow, sprites riding a projectile stretch longer along the path, and bursts throw more pieces. Shapes and words stay; 1 = as made.',
  'Duration': 'Stretches the effect\'s own times: phases, delays, lengths and fixed flight times. A flight by speed, the step rate and times inside a shape (such as Grow time) stay.',
  'Phases': 'The effect\'s three phases, one after the other: wind-up, peak, fade. Layers can start with one, last until one ends, fly during one or break up during one.',
  'Wind-up': 'How long the wind-up lasts, in ms: the first phase, before the peak. 0 skips it; all three at 0 means the effect has no phases.',
  'Peak': 'How long the peak lasts, in ms: the main moment, after the wind-up.',
  'Fade': 'How long the fade lasts, in ms: the last phase, after the peak. Layers often break up during it.',
  'Colour': {
    text: 'A colour from the palette. Team and glow colours follow the faction that fired.',
    when: [
      { title: true, layer: 'sprite', text: 'How the image is coloured: its own colours, or tinted with a colour from the palette.' },
      { title: true, layer: 'projectile', text: 'A projectile has no colours of its own: these are the colours of the layers riding it.' },
      { title: true, layer: ['shape', 'burst', 'word'], text: 'The palette colours this layer uses, also those it draws without naming them, such as the black ink. Click one to change it everywhere.' },
      { in: 'Colour', layer: 'sprite', text: 'Keep the image\'s colours, or multiply them by a palette colour. Draw images meant for tinting in white and greys, so the colour shows true.' },
      { in: 'Effect', text: 'Colours from the palette. The marked one is the effect\'s main colour, used by every layer whose colour is "main"; click a colour to change it or make it the main one.' },
      { in: 'Look', text: 'The pieces\' colour, from the palette.' },
      { in: 'Speed streak', text: 'The streak\'s colour, from the palette.' },
      { in: 'Core line', text: 'The core line\'s colour, from the palette, such as white.' },
      { in: 'Hot head', text: 'The hot head\'s colour, from the palette.' },
      { in: 'Halftone fill', text: 'The halftone dots\' colour, from the palette.' },
      { in: 'tint', text: 'The palette colour that tints the image pieces when the mode is multiply.' },
      { kind: 'smoke', text: 'The smoke\'s body colour, from the palette.' },
      { kind: 'ring', text: 'The colour of the ring\'s line, from the palette.' },
      { kind: 'dots', text: 'The dots\' colour, from the palette.' },
      { kind: 'scorch', text: 'The stain\'s colour, from the palette. It darkens the ground with Mixes: Darkens the ground.' },
      { kind: 'lines', text: 'The lines\' colour, from the palette, often ink.' },
      { kind: 'glow', text: 'The glow\'s colour, from the palette. A gradient, when one is chosen, takes its place.' },
      { kind: 'trail', text: 'The streak\'s main colour, from the palette.' },
      { kind: 'band', text: 'The beam\'s colour, from the palette.' },
      { kind: 'beads', text: 'The beads\' colour, from the palette.' },
    ],
  },

  // ------------------------------------------------------------ cost
  'Cost': 'What the effect costs the game in each quality tier, measured with the game\'s own code. Press Measure; type budgets to see red (over) or green (within).',
  'Measure': 'Play the effect through once per tier at 60 frames a second, at the game camera, and count what it costs. The preview waits meanwhile.',
  'Draws': 'Draw calls at the busiest moment: one per group in use (stains, light on the ground, the rest on the ground, over the scene). All effects playing share them, at most 4.',
  'Sprites alive': 'Items alive at the busiest moment: each sprite, piece, dot, letter, flame tongue, smoke puff, line, bead and shape counts once, however many outlines it has.',
  'Triangles': 'The most triangles drawn at any moment of the effect. The layers with the most in High are named under the table.',
  'Screen area': 'The largest share of the 1920 × 1080 game screen the effect covers at any moment, see-through parts too. Under it: the same with overlaps counted.',
  'CPU ms a frame': 'Time to build one frame of the effect on this computer, in ms: a slow frame, slower than 95 in 100. Under it: the average and the worst.',
  'Low': {
    text: 'The Low quality tier: the game\'s cheapest. It drops extras but must stay readable.',
    when: [
      { in: 'Preview bar', text: 'Draw the preview in the Low tier: only the layers that show in Low.' },
      { in: 'Cost', text: 'The cost when the game draws the Low tier, with only the layers that show in Low.' },
      { layer: ['sprite', 'shape', 'burst', 'word'], text: 'Draw this layer in the Low tier, the cheapest. Low drops extras but must stay readable.' },
    ],
  },
  'Medium': {
    text: 'The Medium quality tier, between Low and High.',
    when: [
      { in: 'Preview bar', text: 'Draw the preview in the Medium tier: only the layers that show in Medium.' },
      { in: 'Cost', text: 'The cost when the game draws the Medium tier, with only the layers that show in Medium.' },
      { layer: ['sprite', 'shape', 'burst', 'word'], text: 'Draw this layer in the Medium tier.' },
    ],
  },
  'High': {
    text: 'The High quality tier: the full look.',
    when: [
      { in: 'Preview bar', text: 'Draw the preview in the High tier: only the layers that show in High.' },
      { in: 'Cost', text: 'The cost when the game draws the High tier, with only the layers that show in High.' },
      { layer: ['sprite', 'shape', 'burst', 'word'], text: 'Draw this layer in the High tier, the full look.' },
    ],
  },
  'Checks': 'The checker the export uses: it names each problem in the file and where it is, such as an unknown colour, a missing image or a layer with no length.',

  // ------------------------------------------------------------ the layer's card
  'Sprite layer': 'An image from the project\'s images folder, placed on the origin, the target or a projectile, sized in metres and shown for a time.',
  'Projectile layer': 'An invisible path from one point to another. Other layers ride it, and layers can start when it lands.',
  'Shape layer': 'A comic shape drawn in code, no image: its kind decides the look, and its settings shape it.',
  'Burst layer': 'Small pieces thrown out from one point, at once or again and again: sparks, chips, dust. Each play throws them differently unless Changes every play is off.',
  'Word layer': 'A comic sound word in our own block letters, such as BOOM. It faces the screen, shows one of its words each play and shrinks with your distance.',
  'Layer name': 'The layer\'s name in the Layers list and on the timeline. Only for you: the game never shows it.',
  'Shows in': 'The quality tiers this layer draws in: Low, Medium, High. Low drops extras but must stay readable; at least one tier stays on.',
  'Shows in Low': 'Draw this layer in the Low tier, the cheapest. Low drops extras but must stay readable.',
  'Shows in Medium': 'Draw this layer in the Medium tier.',
  'Shows in High': 'Draw this layer in the High tier, the full look.',

  // ------------------------------------------------------------ place (shapes, bursts, words) and the sprite's size and place
  'Place': 'Where the layer sits, which way it faces, how it mixes with what is under it, and a small nudge.',
  'Size and place': 'How big the image is, which way it faces and where it sits.',
  'Sits on': 'What the layer is pinned to: the origin (muzzle), the target, or a projectile it rides. A rider moves along the flight and, with Lasts: Automatically, shows while it flies.',
  'Right': {
    text: 'Moves the layer to the right of the point it sits on, in metres. Right, up and forward follow the shot: forward points towards the target.',
    when: [
      { in: 'Path', text: 'Moves this end of the path to the right, in metres. Right, up and forward follow the shot: forward points towards the target.' },
      { layer: 'projectile', text: 'Moves this end of the path to the right, in metres. Right, up and forward follow the shot: forward points towards the target.' },
    ],
  },
  'Up': {
    text: 'Moves the layer up from the point it sits on, in metres, such as 1.2 for head height. Flat on the ground, use Lift off the ground instead.',
    when: [
      { layer: 'sprite', text: 'Moves the image up from the point it sits on, in metres, such as 1.2 for head height.' },
      { in: 'Path', text: 'Moves this end of the path up, in metres: 1 aims the flight a metre above that point.' },
      { layer: 'projectile', text: 'Moves this end of the path up, in metres: 1 aims the flight a metre above that point.' },
    ],
  },
  'Forward': {
    text: 'Moves the layer forward, towards the target, in metres; negative moves it back. Forward lies flat along the ground.',
    when: [
      { in: 'Path', text: 'Moves this end of the path forward, towards the target, in metres: 0.8 starts a flight a little in front of the muzzle.' },
      { layer: 'projectile', text: 'Moves this end of the path forward, towards the target, in metres: 0.8 starts a flight a little in front of the muzzle.' },
    ],
  },
  'input': 'Which point this end is on: origin (the muzzle) or target.',
  'offset': 'Moves this end from its point, in metres: right, up, and forward (towards the target).',
  'Faces': {
    text: 'Which way the layer is turned: to the camera, along the path (the shot), flat on the ground, or upright like a sign, so heights are true heights.',
    when: [
      { layer: 'word', text: 'A word always faces the camera; the checker refuses any other choice.' },
      { layer: 'sprite', text: 'The camera: the image faces you. Along the path: its width lies along the motion or the shot, for tracers and streaks.' },
      { layer: ['shape', 'burst'], text: 'To the camera, along the path (the shot), flat on the ground, or upright like a sign (true heights). Lightening or darkening the ground needs Flat on the ground.' },
    ],
  },
  'Mixes': 'How it mixes with what is under it: Normal paints over it, Adds light is for glows. Lightens or Darkens the ground is for light and stains, and needs Faces: Flat on the ground.',
  'Nudge right': 'Shifts the drawing in its own plane, in metres: right on the screen when it faces the camera, along the path when it faces along it.',
  'Nudge up': 'Shifts the drawing up in its own plane, in metres: up the screen when it faces the camera, away from you when it lies flat on the ground.',
  'Lift off the ground': 'For a layer flat on the ground: how high above the ground it lies, in metres, such as 1 for a ring round a tank\'s middle.',

  // ------------------------------------------------------------ time (every layer)
  'Time': {
    text: 'When the layer starts, how long it shows, and whether it moves in steps, like drawn animation, or smoothly.',
    when: [
      { in: 'Transport', text: 'Where the playhead is and how long the effect lasts, in ms, and which step (1/12 s) it is on. While firing: how many plays are running.' },
      { title: true, layer: 'projectile', text: 'When the projectile leaves, and whether it moves along its path in steps or smoothly. It lasts as long as its flight.' },
    ],
  },
  'Moves': {
    text: 'In steps: the layer holds each drawing for a step, like drawn animation (12 a second is the comic rate). Smoothly: it changes every frame.',
    when: [
      { layer: 'projectile', text: 'In steps: the projectile, and what rides it, moves along its path a step at a time (12 a second is the comic rate). Smoothly: every frame.' },
    ],
  },
  'Steps a second': {
    text: 'How many steps a second when it moves in steps: 12 is the comic rate, 24 quicker. Flickers and boils that happen every other step follow it.',
    when: [
      { layer: 'projectile', text: 'How many steps a second the projectile moves in: 12 is the comic rate, 24 quicker. The layers riding it move on these steps.' },
    ],
  },
  'Starts': 'When the layer starts: with the effect, when a phase starts, or when a projectile lands. Delay adds a wait after that.',
  'Delay': 'How long to wait after the start chosen in Starts, in ms. It grows with the Duration control.',
  'Lasts': {
    text: 'How long it shows: a fixed time, until a phase ends, or Automatically, which works for a rider (the flight), a flipbook (its frames) and a burst (its longest piece).',
    when: [
      { layer: 'projectile', text: 'A projectile lasts as long as its flight: set the flight in Motion.' },
    ],
  },
  'Length': {
    text: 'How long it is, in the unit shown.',
    when: [
      { in: 'Time', text: 'How long the layer shows, in ms, when Lasts is A fixed time. It grows with the Duration control.' },
      { in: 'Speed streak', text: 'How long the streak is at most, in metres; it never reaches back past where the piece started.' },
      { kind: 'flash', text: 'How far the flash reaches forward along the shot, in metres, such as 0.95.' },
      { kind: 'lines', text: 'How long each line is at the start, in metres, picked per line between the two numbers; the lines shorten as they go.' },
    ],
  },

  // ------------------------------------------------------------ seed
  'Seed': {
    text: 'This layer\'s own number for its random look. Another number gives other spikes, pieces or lumps; the same number always gives the same look.',
    when: [
      { title: true, layer: 'word', text: 'The random numbers behind the word: which word shows, its tilt and size, each letter\'s bounce and turn, and whether each play differs.' },
      { title: true, text: 'The random numbers behind this layer\'s look: where spikes, pieces and lumps go, and whether each play differs.' },
      { layer: 'word', text: 'This layer\'s own number for its random look: which word shows, its tilt, bounce and turns. The same number always gives the same look.' },
    ],
  },
  'Changes every play': 'On: the look changes with every play, as each shot in the game differs. Off: every play looks the same.',

  // ------------------------------------------------------------ animation
  'Animation': 'Optional changes over the layer\'s life: Scale makes it bigger or smaller, Solid (0 to 1) fades it. Both work on top of its own settings.',
  'Scale': {
    text: 'How big it is, as a share: 1 is its normal size.',
    when: [
      { in: 'Animation', text: 'Size over time, on top of the layer\'s own size: one value per step from the start (pop in, then settle) and a curve over its life. 1 = no change.' },
      { in: 'Tones', text: 'This tone\'s size as a share of the outer shape: 1 is full size, 0.5 half.' },
      { in: 'Every other step', text: 'The flash\'s size on every other step, such as 0.82, so it flickers between two sizes.' },
      { in: 'Pops in', text: 'How large the word is while it pops in: 1.15 is 15 % larger than normal.' },
    ],
  },
  'Solid (0 to 1)': {
    text: 'How solid it is: 1 is solid, 0.5 half see-through, 0 invisible.',
    when: [
      { in: 'Animation', text: 'How solid the layer is over time: one value per step and a curve over its life, 1 solid, 0 gone. Comic shapes stay solid; light, rings and glows may fade.' },
      { kind: 'glow', text: 'How solid the glow is: 1 is solid, 0.5 half see-through. With a gradient, it fades the gradient\'s colours too.' },
    ],
  },
  'Steps': {
    text: 'A number of steps, or one value per step from the start. A step is 1/12 s at the comic rate.',
    when: [
      { in: 'Scale', text: 'One size per step from the start, such as 1.25, 1, 0.8: it pops in larger, then settles. Only when the layer moves in steps.' },
      { in: 'Solid (0 to 1)', text: 'How solid it is on each step from the start, 0 to 1, such as 0.5, 1: half see-through for one step. Only when it moves in steps.' },
      { in: 'Pops in', text: 'How many steps the word stays large before it settles, such as 2; 0 = no pop.' },
      { layer: 'word', text: 'How many steps the word stays large before it settles, such as 2; 0 = no pop.' },
    ],
  },
  'life': {
    text: 'A curve over the layer\'s life, typed as time:value pairs, time from 0 (start) to 1 (end).',
    when: [
      { in: 'Scale', text: 'Size over the layer\'s life, typed as time:size pairs, time from 0 (start) to 1 (end): 0:1, 1:0.5 shrinks it to half by the end.' },
      { in: 'Solid (0 to 1)', text: 'How solid it is over its life, typed as time:solid pairs, time from 0 to 1: 0:1, 0.6:1, 1:0 stays solid, then fades out at the end.' },
    ],
  },

  // ------------------------------------------------------------ sprite
  'Image': {
    text: 'Which PNG from the project\'s images folder this layer shows. Add PNG images to the project brings in more.',
    when: [
      { title: true, text: 'The image this sprite shows, the point of it that sits on its place (the pivot), and its frames if it is a flipbook.' },
    ],
  },
  'Pivot x': 'Which point of the image sits on its place, across: 0 is the left edge, 0.5 the middle, 1 the right. Or click the thumbnail.',
  'Pivot y': 'Which point of the image sits on its place, down: 0 is the top edge, 0.5 the middle, 1 the bottom. Or click the thumbnail.',
  'Flipbook (a grid of frames)': 'The image is a grid of frames, read left to right and top to bottom, one frame per step. Set its columns, rows and frames.',
  'Columns': 'How many frames across the image\'s grid.',
  'Rows': 'How many frames down the image\'s grid.',
  'Frames': 'How many frames the flipbook plays: at most columns × rows, so the last cells can stay empty.',
  'Loop the frames': 'On: the frames play again and again while the layer shows. Off: they play once, and Lasts: Automatically ends with the last frame.',
  'Width': {
    text: 'How wide it is, in the unit shown.',
    when: [
      { layer: 'sprite', text: 'The image\'s width in metres. It grows with the Size control, and with the Intensity control when it sits on the origin or target.' },
      { in: 'Speed streak', text: `How wide the streak is at the piece, in ${PX}; it tapers to a point behind.` },
      { kind: 'ring', text: `How thick the ring's coloured line is, in ${PX}, such as 4.` },
      { kind: 'lines', text: `How thick each line is, in ${PX}, picked per line between the two numbers.` },
      { kind: 'trail', text: `The streak's width at its tail and at its head, in ${PX}, such as 4.5 and 4.5.` },
    ],
  },
  'Height': {
    text: 'How tall it is, in metres.',
    when: [
      { layer: 'sprite', text: 'The image\'s height in metres. It grows with the Size control, and with the Intensity control when it sits on the origin or target.' },
      { kind: 'flames', text: 'How tall the tongues are, in metres, between the two numbers: back tongues are the tallest, front ones shorter.' },
    ],
  },
  'Role': 'The palette colour that tints the image: "main" is the effect\'s main colour. Team and glow colours follow the faction that fired.',

  // ------------------------------------------------------------ projectile
  'Path': 'Where the flight starts and ends: each end on the origin (muzzle) or the target, moved by an offset in metres.',
  'From': {
    text: 'Where the flight starts: the origin (muzzle) or the target. Right, Up and Forward move it from there.',
    when: [
      { kind: 'band', text: 'Where the beam starts: on the origin or the target (input), moved by an offset in metres.' },
      { kind: 'beads', text: 'Where the beads start running from: on the origin or the target (input), moved by an offset in metres.' },
    ],
  },
  'To': {
    text: 'Where the flight ends: the origin (muzzle) or the target. Right, Up and Forward move it from there.',
    when: [
      { kind: 'band', text: 'Where the beam ends: on the origin or the target (input), moved by an offset in metres.' },
      { kind: 'beads', text: 'Where the beads run to: on the origin or the target (input), moved by an offset in metres.' },
    ],
  },
  'Motion': 'How the projectile flies: how long, how high its arc, and how the sprites riding it stretch and turn.',
  'Flight': 'How long the flight takes: By speed (distance ÷ speed, so a farther target takes longer), a Fixed time, or exactly One phase.',
  'Speed': {
    text: 'How fast it moves, in metres a second.',
    when: [
      { in: 'Transport', text: 'Play slower to look closely: full speed, a half, a quarter or a tenth. Fire plays at this speed too.' },
      { in: 'Motion', text: 'How fast it flies, in metres a second: flight time = distance ÷ speed. At a rifle\'s real speed (about 800) it lands within one step.' },
      { layer: 'projectile', text: 'How fast it flies, in metres a second: flight time = distance ÷ speed. At a rifle\'s real speed (about 800) it lands within one step.' },
      { in: 'Pieces', text: 'How fast each piece leaves, in metres a second, picked per piece between the two numbers.' },
      { layer: 'burst', text: 'How fast each piece leaves, in metres a second, picked per piece between the two numbers.' },
    ],
  },
  'Flight time': 'How long the flight takes, in ms, whatever the distance. It grows with the Duration control.',
  'Flies during': 'The flight lasts exactly as long as this phase. To leave when the phase starts, set Starts to that phase too.',
  'Arc height': 'How high the path rises above the straight line at its middle, in metres; 0 flies straight.',
  'Stretch along the path': 'How much longer the sprites that ride it and face along the path get: 1 is no stretch, 2 twice as long. It grows with the Intensity control.',
  'Spin': {
    text: 'How fast it turns, in degrees a second; negative turns the other way.',
    when: [
      { layer: 'projectile', text: 'How fast the sprites that ride it turn in their own plane, in degrees a second; negative turns the other way.' },
      { layer: 'burst', text: 'How fast each piece turns, in degrees a second, picked per piece between the two numbers. Chips, shards and image pieces turn; sparks point the way they fly.' },
    ],
  },

  // ------------------------------------------------------------ burst
  'Pieces': 'How many pieces fly, how fast and which way, how long they live, how they fall and slow down, and how big they are.',
  'How many': {
    text: 'How many there are.',
    when: [
      { in: 'Rings closing in', text: 'How many rings close in at once, evenly spaced in time, such as 3.' },
      { in: 'Keeps coming', text: 'How many puffs or billows are alive at once, starting evenly spaced in time, such as 3.' },
      { kind: 'ring', text: 'How many rings close in at once, evenly spaced in time, such as 3.' },
      { kind: 'smoke', text: 'How many puffs or billows are alive at once, starting evenly spaced in time, such as 3.' },
      { layer: 'burst', text: 'How many pieces are thrown, such as 9. It grows with the Intensity control.' },
      { kind: 'lines', text: 'How many speed lines, such as 9.' },
      { kind: 'beads', text: 'How many beads run along the line at once, such as 3.' },
      { kind: 'flames', text: 'How many flame tongues, such as 7: about a third at the back, a third in the middle, a fifth in front, the rest round the rim.' },
    ],
  },
  'Life': {
    text: 'How long each one lives, in ms.',
    when: [
      { in: 'Keeps coming', text: 'How long each puff or billow lives, in ms, before a new one starts in its place, such as 1600.' },
      { kind: 'smoke', text: 'How long each puff or billow lives, in ms, before a new one starts in its place, such as 1600.' },
      { layer: 'burst', text: 'How long each piece lives, in ms, picked per piece between the two numbers. Without Keeps coming, Lasts: Automatically ends with the longest.' },
    ],
  },
  'Direction': 'Which way pieces fly: out goes all round, up stays within Spread of straight up. Path stays within Spread of the shot; use it with Faces: Along the path.',
  'Spread': {
    text: 'How far they spread.',
    when: [
      { layer: 'burst', text: 'How far pieces stray from up or from the path, in degrees to each side: 30 is a narrow jet, 180 all round. Not used with out.' },
      { kind: 'lines', text: 'How far the lines move out as they go, as a share of their inner radius: 0.5 moves them out by half.' },
    ],
  },
  'Starts at radius': 'How far from its point each piece starts, in metres, picked per piece between the two numbers; 0 starts right on the point.',
  'Gravity': 'How strongly pieces fall, in metres a second per second: about 10 is real gravity, 0 none, negative makes them rise.',
  'Drag': 'How fast pieces slow down: 0 never; 3 loses most of the speed in a third of a second.',
  'Size over life': 'Each piece\'s size over its own life, typed as time:size pairs from 0 (born) to 1 (gone): 0:1, 1:0.4 shrinks it to 40 % by the end.',
  'Keeps coming': {
    text: 'Starts again and again while the layer shows, instead of once.',
    when: [
      { layer: 'burst', text: 'On: each piece starts again when its life ends, so the burst keeps going; then set how long it Lasts. Off: one throw.' },
      { kind: 'smoke', text: 'New puffs or billows keep coming while the layer shows, each living its own life. Set how many are alive at once and how long each lives.' },
    ],
  },
  'Stops on the ground': 'Pieces stop on the ground instead of falling through it. It works when the layer faces the camera or stands upright.',
  'Start area (half width, half height)': 'Pieces start anywhere in a box round their point: half its width and half its height, in metres, as for sparks over a fire.',
  'Speed streak': 'A tapered streak behind each piece, pointing back the way it came, in its own colour. Set its colour, length and width.',
  'Look': {
    text: 'What each piece looks like: its kind, colour and edge.',
    when: [
      { in: 'Pieces', text: 'What each piece looks like: its kind, colour and edge.' },
      // F2, from the spec: the live picture at the top of every layer's panel (a title with no section round it).
      { title: true, text: 'A live picture of this layer alone, drawn by the game\'s code on the ground colour and playing its own time in a loop.' },
    ],
  },
  'Kind': 'The piece\'s shape: diamond, chip, spark, dot, shard, speck, puff, streak or spike. Sparks, spikes and streaks point the way they fly.',
  'Edge colour': 'The colour of the pieces\' ink edge when it should not be black, such as a stone chip\'s darker rim.',

  // ------------------------------------------------------------ word
  'Word': 'The words and how they are drawn: letter size, tilt, bounce, pop-in, how they shrink away and who sees them.',
  'Words (one picked per play)': 'The words, with commas between: each play shows one, or none when every word has a chance and they add up to under 100 %. Letters A to Z and !; a space makes a gap.',
  'Letter height': `How tall the letters are, in ${PX}, at full size, such as 32. Distance from you shrinks them; the Size control grows them.`,
  'Tilt': 'How far the whole word leans, in degrees, picked per play between the two numbers; negative leans it the other way.',
  'Size varies by': 'How much the word\'s size changes from play to play, as a share up or down: 0.1 is up to 10 % bigger or smaller.',
  'Letters grow along': 'Letters grow (+) or shrink (-) along the word: 0.2 goes from 10 % smaller at the first letter to 10 % bigger at the last.',
  'Bounce': 'How far each letter sits above or below the line, at random, in sevenths of the letter height: 0.35 is a small hop.',
  'Letter turn': 'How far each letter turns at random, in degrees, such as 4.',
  'slant deg': 'How far the letters slant, like italics, in degrees: 9 leans their tops to the right.',
  'Shrinks in steps': 'When it breaks up, the word shrinks away in this many steps; 0 shrinks it smoothly.',
  'Rise': {
    text: 'How far it rises over its life, in metres.',
    when: [
      { layer: 'word', text: 'How far the word rises, in metres: over its life, or only while it breaks up when Breaks up is on.' },
      { kind: 'smoke', text: 'How far the smoke rises over its life, in metres, such as 0.5.' },
    ],
  },
  'Seen by': 'Who sees the word: everyone, or shooter, only the player who fired (a gun\'s sound word). Set Made by to You to see it.',
  'Line between outlines': 'A thin line in this colour between two black outlines, so the word reads on anything.',
  'Colours': 'The word\'s two flat tones, top and bottom with a hard edge between them, and the dark copy pushed back behind it.',
  'Top': 'The colour of each letter\'s top part, above the hard edge a little below the middle.',
  'Bottom': 'The colour of each letter\'s bottom part, below the hard edge.',
  'Pushed-back copy': 'The colour of the copy of the word pushed down and to the side behind it, which gives the letters depth.',
  'Pops in': 'The word pops in a little too large for its first steps, then settles.',
  'Size by distance': 'How the word shrinks with the distance from you: a curve of metres and sizes, and a size under which it is not drawn.',
  'Curve (metres: share)': 'Size by your distance, typed as metres:share pairs: 0:1, 2:1, 5:0.6, 8:0.6, 11:0 is full size to 2 m, 60 % from 5 to 8 m, gone at 11 m.',
  'Not drawn under (px)': `When distance makes the letters smaller than this, in ${PX}, the word is not drawn, such as 14.`,

  // ------------------------------------------------------------ shapes: the section of each kind
  'Shape: shards': 'A star of uneven spikes in layered tones: bursts, glints and hit stars. Points and Unevenness shape it; Tones colour it from the outside in.',
  'Shape: flash': 'A muzzle flash along the shot: a long spike forward, side spikes and short spikes back, in layered tones. It changes on every other step.',
  'Shape: cloud': 'A lumpy, scalloped cloud in layered tones, for blast cores and puff bursts. Lobes set its bumps.',
  'Shape: smoke': 'Smoke: a puff (a few rounds with a rim) or a billow (lumpy, lit from above, halftone underneath) that grows, rises and drifts.',
  'Shape: ring': 'A circle, usually on the ground round a blast or a fire: zigzag, toothed, solid or dashed; or rings that close in again and again.',
  'Shape: dots': 'A field of halftone dots: the soft edge of a blast, or light on the ground. The dots shrink towards the edge.',
  'Shape: scorch': 'A stain on the ground: an oval, or a splat with lobes. Use it with Mixes: Darkens the ground.',
  'Shape: lines': 'Thin lines shooting out from the middle (speed lines), gone after a share of the layer\'s life.',
  'Shape: glow': 'A soft round glow, or a flat disc of light. Use it with Mixes: Adds light or Lightens the ground.',
  'Shape: trail': 'A streak along a projectile\'s path, behind it. It must ride a projectile.',
  'Shape: band': 'A beam from one point to another: solid, soft (light) or broken. It can find its target and let go during phases.',
  'Shape: beads': 'Bright beads running along a line again and again, to show the direction of a drain.',
  'Shape: flames': 'Flame tongues in rows, back to front: long S-curves that sway and lean, each with a light core and a shaded side.',
  'Shape: bed': 'The boiling bed of a fire: rounded lumps in tone bands, dark at the rim and bright in the middle. Or only its detail on top.',

  // ------------------------------------------------------------ shapes: settings several kinds share
  'Radius': {
    text: 'How big the shape is, in metres from its middle to its edge. It grows with the Size control.',
    when: [
      { kind: 'shards', text: 'How far the spikes reach from the middle, in metres, such as 1.1; Unevenness makes some longer, some shorter.' },
      { kind: 'cloud', text: 'The cloud\'s size, in metres from its middle to about the tips of its lobes, such as 1.' },
      { kind: 'smoke', text: 'How big each puff or billow is, in metres, before Size over life makes it grow and shrink, such as 0.4.' },
      { kind: 'ring', text: 'The ring\'s size, in metres from its middle to its line, once it has grown, such as 1.4.' },
      { kind: 'dots', text: 'How far the field of dots reaches from its middle, in metres, such as 1.9.' },
      { kind: 'scorch', text: 'The stain\'s size, in metres from its middle to its edge, such as 1.1.' },
      { kind: 'glow', text: 'How far the glow reaches from its middle, in metres, before Size over life changes it, such as 1.' },
      { kind: 'flames', text: 'How far the fire area reaches from its middle, in metres, such as 2.2: the tongues stand in rows inside it.' },
      { kind: 'bed', text: 'The fire bed\'s size, in metres from its middle to its rim, such as 2.2.' },
    ],
  },
  'Ink line': {
    text: `How thick the black outline is, in ${PX}; 0 = none.`,
    when: [
      { in: 'Look', text: `How thick each piece's edge is, in ${PX}; 0 = none.` },
      { layer: 'burst', text: `How thick each piece's edge is, in ${PX}; 0 = none.` },
      { kind: ['shards', 'flash', 'cloud'], text: `How thick the black outline round the outer tone is, in ${PX}, such as 4; 0 = none. Edge decides who sees it.` },
      { kind: 'smoke', text: `How thick the rim round each round of the smoke is, in ${PX}, in the Rim colour.` },
      { kind: 'ring', text: `The black line under the coloured one, in ${PX}: make it wider than Width to show a black edge; 0 = none. Dashed rings have none.` },
      { kind: 'trail', text: `How much black edge shows on each side of the streak, in ${PX}, when Edge gives it ink.` },
      { kind: ['flames', 'bed'], text: `How thick the line round the fire's shapes is, in ${PX}. With Edge on auto, an enemy's fire gets heavy ink and your team's fire gets a thinner dark line.` },
    ],
  },
  'Edge (friend or foe)': {
    text: 'With auto, an enemy\'s shape gets an ink outline and your team\'s shape gets a thin dashed line; with enemy, your team\'s shape gets none. Ink, broken and none look the same for all.',
    when: [
      { in: 'Core line', text: 'Who sees the core line. With enemy, only an enemy\'s effect shows it, and with none nobody sees it; auto, ink and broken always show it.' },
      { in: 'Look', text: 'With auto, an enemy\'s pieces get an ink edge and your team\'s pieces are hollow outlines; with enemy, your team\'s pieces have no edge. Ink, broken and none look the same for all.' },
      { layer: 'burst', text: 'With auto, an enemy\'s pieces get an ink edge and your team\'s pieces are hollow outlines; with enemy, your team\'s pieces have no edge. Ink, broken and none look the same for all.' },
      { kind: 'band', text: 'With auto, an enemy\'s beam is solid and your team\'s beam is dashed; with enemy, your team\'s beam is not drawn. Ink is always solid, broken always dashed, none never drawn.' },
      { kind: 'trail', text: 'With auto or enemy, an enemy\'s streak gets the black edge of Ink line and your team\'s streak gets none. Ink always gives the edge; broken and none never do.' },
      { kind: ['flames', 'bed'], text: 'With auto, an enemy\'s fire gets heavy ink lines and your team\'s fire gets a thinner line in its own dark colour. With enemy, your team\'s fire gets no line.' },
    ],
  },
  'Height (share of width)': {
    text: 'Height as a share of width: 1 is round, less squashes it top to bottom.',
    when: [
      { kind: ['shards', 'cloud'], text: 'Height as a share of width: 1 is round, less squashes it top to bottom, such as 0.86.' },
      { kind: 'ring', text: 'Height as a share of width: 1 is round. Below 1, such as 0.58, makes a ring facing the camera look as if it lay on the ground.' },
      { kind: 'dots', text: 'The field\'s height as a share of its width; the dots stay round. Below 1, such as 0.58, makes a field facing the camera look flat on the ground.' },
    ],
  },
  'Breaks up': {
    text: 'How it falls apart at the end: over a phase, or over its last ms.',
    when: [
      { layer: 'word', text: 'The word shrinks away at the end, over a phase or over its last ms; Shrinks in steps sets in how many steps.' },
      { kind: 'shards', text: 'At the end the star shrinks to half and its tones drop away from the outside in, each at its own point, over a phase or its last ms.' },
      { kind: 'cloud', text: 'At the end the cloud shrinks by 40 % and its tones drop away, each at its own point, over a phase or over its last ms.' },
      { kind: 'ring', text: 'Only with Dashed after: a solid or toothed ring turns dashed and loses its teeth part way through, over a phase or its last ms.' },
      { kind: 'dots', text: 'At the end the dots shrink to nothing, over a phase or over its last ms.' },
      { kind: 'trail', text: 'At the end the streak falls into dashes that thin out and shrink towards the front, over a phase or its last ms; at 70 % it is gone.' },
      { kind: 'flames', text: 'As the fire cools, tongues go out one by one and get shorter, in 8 steps, over a phase or over its last ms.' },
      { kind: 'bed', text: 'As the fire cools, the bed shrinks and its bands go out from the middle, in 8 steps, over a phase or over its last ms.' },
    ],
  },
  'Breaks up over': 'When it breaks up: over a phase (wind-up, peak or fade), or over the layer\'s last ms.',
  'phase': 'The phase it breaks up over, from that phase\'s start to its end.',
  'last ms': 'It breaks up over this many ms at the end of the layer\'s life, such as 200.',
  'Halftone fill': 'Halftone dots in the outer tone\'s band, getting smaller towards one side. Set their colour, spacing, size and side.',
  'Dot spacing': `How far apart the dots are, in ${PX}, such as 8.`,
  'Dot size': {
    text: `How big the biggest dots are, in ${PX}, such as 4; the dots get smaller towards one side or the edge.`,
    when: [
      { in: 'Halftone fill', text: `How big the biggest dots are, in ${PX}, such as 3.5; they get smaller towards the side in Fades towards.` },
      { kind: 'dots', text: `How big the biggest dots are, in ${PX}, such as 4; they get smaller towards the edge.` },
    ],
  },
  'Fades towards': 'The side the dots get smaller towards, in degrees on screen: 0 is right, 90 up, 180 left, 270 down.',
  'Tones': {
    text: 'The shape\'s colours, in layers.',
    when: [
      { kind: ['shards', 'flash', 'cloud'], text: 'Copies of the shape in layered colours, outer first; each tone\'s Scale sets its size as a share of the outer one.' },
      { kind: 'flames', text: 'The fire\'s colours from outer to inner: body, middle, hot, core. Back tongues use the outer ones, nearer tongues the hotter end.' },
      { kind: 'bed', text: 'One band of lumps per colour, from the rim to the middle: dark at the rim, bright in the middle.' },
    ],
  },
  'Tone #': 'This tone\'s colour, from the palette. Tone 1 is the outer copy; each next tone sits inside the one before.',
  '#': {
    text: 'This tone\'s colour, from the palette.',
    when: [
      { kind: 'flames', text: 'This tone\'s colour: 1 body, 2 middle, 3 hot, 4 core, outer to inner; nearer tongues use the hotter ones. A fifth or sixth is not drawn.' },
      { kind: 'bed', text: 'This band\'s colour, counted from the rim (1) to the middle.' },
    ],
  },
  'Unevenness': {
    text: 'How uneven it is: 0 is perfectly regular.',
    when: [
      { in: 'Every other step', text: 'How much the flash\'s corners move on every other step, as a share of its length, so it looks redrawn, such as 0.08.' },
      { kind: 'flash', text: 'How much the flash\'s corners move on every other step, as a share of its length, so it looks redrawn, such as 0.08.' },
      { kind: 'shards', text: 'How uneven the spikes are, in length and angle: 0 is a regular star (a glint, a hit star), 0.3 a rough burst.' },
    ],
  },
  'Style': {
    text: 'Which look it has.',
    when: [
      { kind: 'smoke', text: 'The smoke\'s look: puff, a few rounds with a rim; or billow, lumpy, lit from above (Light colour), with halftone underneath.' },
      { kind: 'ring', text: 'The ring\'s look. With auto-zigzag or auto-teeth, an enemy\'s ring is a zigzag or has teeth and your team\'s ring is dashed; solid, dashed, zigzag and teeth look the same for all.' },
      { kind: 'scorch', text: 'The stain\'s look: oval, a plain round stain, or splat, a stain with rounded lobes (set Lobes).' },
    ],
  },
  'Lobes': {
    text: 'How many rounded bumps round the edge.',
    when: [
      { kind: 'cloud', text: 'How many bumps round the cloud\'s edge, such as 13; inner tones get fewer.' },
      { kind: 'scorch', text: 'How many rounded bumps round a splat, such as 8. An oval does not use it.' },
    ],
  },
  'Grows from': 'It starts at this share of its full size and grows to full size over Grow time: 0.55 starts at a bit over half.',
  'Grow time': {
    text: 'How long it takes to grow to full size, in ms; 0 is full size at once.',
    when: [
      { kind: ['ring', 'dots'], text: 'How long it takes to grow from Grows from to full size, in ms, such as 72; 0 is full size at once.' },
      { kind: 'scorch', text: 'How long the stain takes to grow from nothing to full size, in ms; 0 is at once.' },
      { kind: 'flames', text: 'How long the fire area takes to race out at the start, in ms, such as 250; tongues outside it wait.' },
      { kind: 'bed', text: 'How long the bed takes to grow in at the start, in ms, such as 250.' },
    ],
  },
  'Flicker': {
    text: 'How much it changes on every other step, so it flickers.',
    when: [
      { kind: 'glow', text: 'On every other step the glow is this much larger: 0.1 is 10 % larger.' },
      { kind: 'band', text: 'On every other step the beam is this much wider: 0.1 is 10 % wider.' },
      { kind: 'dots', text: 'On every other step the field\'s edge grows by this many metres, so it breathes, such as 0.05.' },
    ],
  },
  'Soft': {
    text: 'On: the edges fade out softly, like light. Off: hard edges.',
    when: [
      { kind: 'glow', text: 'On: the glow fades out softly to its rim. Off: a flat disc of light.' },
      { kind: 'band', text: 'On: the beam\'s sides fade out softly, like light. Off: hard sides.' },
    ],
  },
  'Inner radius': {
    text: 'How far from the middle it starts, in metres.',
    when: [
      { kind: 'dots', text: 'No dots inside this distance from the middle, in metres; with a Soft edge, it makes a ring of light.' },
      { kind: 'lines', text: 'Where each line starts, in metres from the middle, picked per line between the two numbers.' },
    ],
  },
  'Period': {
    text: 'How long one round takes, in ms, before it starts again.',
    when: [
      { in: 'Rings closing in', text: 'How long one ring takes to close in, in ms, such as 900.' },
      { kind: 'ring', text: 'How long one ring takes to close in, in ms, such as 900.' },
      { kind: 'beads', text: 'How long one bead takes to run the whole line, in ms, such as 700.' },
    ],
  },
  'Boil (turn every other step)': 'Turns the drawing this many degrees on every other step, so it boils like a hand-drawn frame, such as 3.',

  // ------------------------------------------------------------ shapes: one kind each
  'Points': 'How many spikes the star has, such as 11.',
  'Inner corners': 'Where the corners between spikes sit, as a share of the radius: 0.5 is halfway; smaller makes thinner, sharper spikes.',
  'Turn': 'Turns the whole star, in degrees.',
  'First step white': 'The first step is drawn all white and a bit larger: the one white frame when a shell lands. Only when it moves in steps.',
  'Second jagged edge': 'Draws a second, jagged ink line inside the first, at about three quarters of the size.',
  'Every other step': 'On every other step the flash is drawn smaller and changed a little, as the drawing board swaps two drawings.',
  'Lobe depth': 'How far the bumps stand out, as a share of the radius, such as 0.16.',
  'Light colour': 'The colour of a billow\'s lighter top, lit from above. A puff does not use it.',
  'Rim colour': 'The colour round each round of the smoke (as thick as Ink line), and of a billow\'s halftone underneath.',
  'Size over life (start, peak, end)': {
    text: 'How big it is over its life, as a share of its Radius, from its start to its end.',
    when: [
      { kind: 'smoke', text: 'How big each puff or billow is at its start, its peak (78 % through its life) and its end, as a share of Radius: 0.75, 1.65, 0 grows, then shrinks away.' },
      { kind: 'glow', text: 'Only two numbers for a glow: how big it is at the start and at the end of its life, as a share of Radius; 1, 1 stays the same.' },
    ],
  },
  'Drift (right, forward)': 'How far the wind carries the smoke over its life, in metres: to the right, and away from the camera.',
  'Teeth': 'How many zigzag corners or teeth go round the ring, such as 26.',
  'Teeth reach': 'How far the teeth or zigzag corners reach in from the ring, in metres, such as 0.3.',
  'Dashed after': 'With Breaks up on: a solid or toothed ring turns dashed and loses its teeth once its break-up passes this share, 0 to 1, such as 0.5.',
  'Rings closing in': 'Rings that close in on the middle again and again, like a lock-on, in place of the plain ring. Set how many, how often and from what size to what size.',
  'From radius': 'The size a closing ring starts at, in metres, such as 3.',
  'To radius': 'The size a closing ring ends at, in metres, such as 1.',
  'Soft edge': '0: the dots shrink from the middle out. Above 0: they stay full size and shrink only over this many metres at the outer edge.',
  'Dark middle': 'A darker middle, as a share of the stain\'s size: 0.6 covers 60 %; 0 = none.',
  'Middle colour': 'The colour of the stain\'s darker middle, from the palette.',
  'Gone after (share of life)': 'The lines shorten and are gone after this share of the layer\'s life: 0.5 is halfway.',
  'Gradient, middle to rim': 'A gradient from the palette, from the middle to the rim; with one, the glow takes its colours from it, not from Colour. Make one in the colour picker.',
  'Length (share of path)': 'How much of the path behind the projectile the streak covers, as a share of the whole path: 0.1 is a tenth.',
  'Hot head': 'The front part of the streak in another colour, like a shell\'s hot head. Set its colour and its share of the streak.',
  'Share': 'How much of the streak, from the front, is the hot head: 0.4 is 40 %.',
  'Core line': 'A thin line along the middle of the streak, in its own colour and width; its Edge decides who sees it.',
  'Width (px)': `How thick the core line is, in ${PX}, such as 3.`,
  'Dashes': 'How many dashes the streak falls into when it breaks up, such as 5.',
  'Width (start, end)': {
    text: 'How wide it is, in metres: two numbers.',
    when: [
      { kind: 'band', text: 'The beam\'s width in metres at its start (From) and at its end (To), such as 0.17 and 0.12.' },
      { kind: 'flames', text: 'Each tongue\'s width in metres, picked per tongue between the two numbers; shorter tongues get narrower.' },
    ],
  },
  'Finds the target during': 'Over this phase the beam grows from its start to its end as a thin dashed line, finding the target; before it, nothing shows.',
  'Lets go during': 'Over this phase the beam pulls back from its end towards its start, and thins.',
  'Glow colour': 'A soft glow round each bead, in this colour.',
  'Depth': 'Which rows of tongues this layer draws: back, middle, front, or all. Split a fire into layers to put other layers between its rows.',
  'Lean': 'How far the tips lean with the wind, in metres per metre of height, such as 0.15; negative leans them left.',
  'Sway': 'How far the tongues swing from side to side as the S-bend travels up them, as a share of their height, such as 0.12.',
  'Steps per sway': 'How many steps one sway takes, picked per tongue between the two numbers, such as 5 to 8.',
  'Shade colour': 'The colour of the back tongues\' shaded side, and of your team\'s thinner outline.',
  'Licks let go': 'A small flame lets go of each tall tongue\'s tip, just after it stretched furthest, and drifts up as it shrinks.',
  'Lumps': 'How many lumps round the outer band, such as 12; inner bands get fewer.',
  'Part': 'Which part this layer draws: lumps, the flat tone bands, or detail, only the detail on top (halftone where tones meet, brush strokes). Use two layers, lumps under detail.',
  'Detail colour': 'The dark colour of the lines between the bands, and of your team\'s thinner outline.',
  'Boil every (steps)': 'The lumps change every this many steps, such as 2, so the bed boils.',

  // ------------------------------------------------------------ buttons in the right panel (not in the settings inventory)
  'Add PNG images to the project…': 'Copy PNG files from your computer into the project\'s images folder, so layers can use them. An example cannot change: Save as first.',
  'Add a tone': 'Add a tone inside the last one: the same colour at 60 % of its size.',
  'Remove': 'Remove this tone. A shape keeps at least one.',

  // ------------------------------------------------------------ shown only when a file has them (not in the examples)
  'gradient': {
    text: 'The name of a palette gradient that colours this layer in place of its colour.',
    when: [
      { kind: 'smoke', text: 'The name of a palette gradient for the smoke\'s body colour over the life of each puff or billow, in place of Colour.' },
      { kind: 'bed', text: 'The name of a palette gradient that colours the bed from the middle to the rim, in place of the tones. Give the lumps and the detail the same one.' },
      { layer: 'burst', text: 'The name of a palette gradient that colours each piece over its own life, in place of the look\'s colour.' },
    ],
  },
  'tint': 'How the image pieces are coloured: kept as they are, or multiplied by a palette colour.',
  'mode': 'How the image pieces are coloured: keep, their own colours, or multiply, tinted by the Colour (draw such images in white and greys).',
  'Goes at': 'When this tone drops away during the break-up, as a share of it from 0 to 1.',

  // ------------------------------------------------------------ the top bar
  'Projects…': 'Open another project, make a new one, or make a project from an export folder.',
  'Save': 'Save the effects, colours and project settings into the project\'s folder. An example cannot change: it asks for a copy (Save as…).',
  'Save as…': 'Save a copy of this project under a new name in the projects folder, and go on in the copy. Examples need it to keep changes.',
  'Export…': 'Write the folder the game loads into exports/: the list of effects, one file per effect, one packed image and the colours. Unsaved changes are asked about first.',
  'Undo': 'Take back the last change; one drag counts as one change.',
  'Redo': 'Bring back the change you took back.',
  'Night mode': 'Dark grey panels instead of the light, warm ones. The preview keeps the game\'s colours; the choice is remembered.',
  'Keys': 'The keyboard shortcuts.',

  // ------------------------------------------------------------ the bar above the preview
  'Fire': 'Fire the effect from the stand-in to the target, as the game does: each press is a new play, and several can overlap.',
  'Scene': 'The set-up the effect plays in: who fires, from where to where, and what stands round. Each effect remembers its scene.',
  'Faction that fired': 'The faction that made the effect: Soviets, Allies or Empire. Team and glow colours follow it.',
  'Made by': 'Who made the effect, seen from you: an enemy (solid ink edges), your team (thin broken edges) or you (your own sound words show too).',
  'Distance from you': 'How far you are from the event, in metres. Comic words shrink with it, each by its own curve; in a scene with you in it, it moves the target.',
  'Tier': 'The quality tier the preview draws: Low, Medium or High. Layers not in it are left out, and fade in the Layers list and on the timeline; timings stay the same.',
  'View': 'How much of the game screen the preview shows: the whole screen, game size (100 %: a 1.8 m soldier is about 150 px), or a close-up.',
  'Close-up on': 'What the close-up centres on: the muzzle or the target.',

  // ------------------------------------------------------------ the transport (Speed and Time have their variants above)
  'Step back': 'Go one step back (1/12 s) and pause.',
  'Play': 'Play the effect on the timeline, or pause it. Unlike Fire, you can pause, step and loop.',
  'Step forward': 'Go one step forward (1/12 s) and pause.',
  'Loop': 'On: Play starts again from the beginning after a short rest. Off: it stops at the end.',

  // ------------------------------------------------------------ the Effects and Layers lists
  'Effects': 'The effects in this project, each saved as its own file. Click one to see and edit it.',
  'New': 'Make a new, empty effect in this project.',
  'From preset…': 'Copy a ready-made effect from the example projects into this one, such as the drawing board\'s four and the comic hits. The preset itself stays as it is.',
  'Delete effect': 'Delete this effect. Undo brings it back until you leave the editor.',
  'Layers': 'The selected effect\'s layers. The top of the list draws on top; click a layer to see its settings.',
  'Add a layer': 'Add a sprite (an image), a projectile (a path in flight), one of 14 shapes, a burst of pieces or a word. It goes above the selected layer.',
  'Move up': 'Move the selected layer up the list, so it draws over more.',
  'Move down': 'Move the selected layer down the list, so it draws under more.',
  'Duplicate': 'Make a copy of the selected layer, just above it.',
  'Delete layer': 'Delete the selected layer. Undo brings it back.',
};

/** Labels shown in other words for the same thing. */
const ALIASES: Readonly<Record<string, string>> = {
  'Pause': 'Play',
  '＋ Add…': 'Add a layer',
  'Measure again': 'Measure',
};

/**
 * This round's new controls with a label of their own (F1, F5, F7), written from the spec and the other helper's work in
 * progress, not from committed code. helpFor() falls back to them; they are not in HELP or its counts. F2's "Look" is a
 * title variant of HELP's "Look".
 */
export const NEW_LABELS: Readonly<Record<string, string>> = {
  'Fade other layers': 'While a layer is selected or hovered, the other layers fade in the preview so it stands out. Off: the preview shows the game\'s look.',
  'Show all': 'Show every colour of the palette, not only the selection\'s; the selection\'s colours show in bold.',
  'Layers riding it': 'The layers riding this projectile: they move along its path. Click one to select it.',
};

/** The keys bindKeys (App.ts) really binds, for the tooltip's kbd. */
export const SHORTCUTS: Readonly<Record<string, string>> = {
  'Save': 'Ctrl+S',
  'Undo': 'Ctrl+Z',
  'Redo': 'Ctrl+Shift+Z or Ctrl+Y',
  'Fire': 'F',
  'Play': 'Space',
  'Pause': 'Space',
  'Step back': '←',
  'Step forward': '→',
  'Loop': 'L',
  'View': '1, 2, 3',
  'Whole screen': '1',
  'Game size': '2',
  'Close-up': '3',
  'Delete layer': 'Delete',
};

/** The cost table's rows, for the budget boxes ("Budget: Draws, Low"). */
const BUDGET_TEXT: Readonly<Record<string, (tier: string) => string>> = {
  'Draws': (t) => `Budget: the most draw calls allowed in the ${t} tier.`,
  'Sprites alive': (t) => `Budget: the most items alive at once in the ${t} tier.`,
  'Triangles': (t) => `Budget: the most triangles allowed in the ${t} tier.`,
  'Screen area': (t) => `Budget: the largest share of the screen allowed in the ${t} tier, in %.`,
  'CPU ms a frame': (t) => `Budget: the most CPU ms a frame allowed in the ${t} tier, compared with the slow frame.`,
};
const BUDGET_TAIL = ' Over it the value turns red, within it green; typing a number switches the project\'s budgets on.';

/** What `pickHelp` found: the table's key, which variant (null: the default), and the text. */
export interface HelpPick {
  key: string;
  variant: number | null;
  text: string;
}

function listOf<T>(v: T | readonly T[] | undefined): readonly T[] {
  return v === undefined ? [] : Array.isArray(v) ? (v as readonly T[]) : [v as T];
}

function sectionPath(s: HelpWhere['section']): string[] {
  if (s === undefined) return [];
  const parts = typeof s === 'string' ? s.split(' > ') : [...s];
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** The table's key for a label as shown (or as the settings inventory names it). */
export function helpKey(label: string): string {
  let s = label.trim().replace(/\.\.\.$/, '…');
  s = s.replace(/ \((?:2|3)\)$/, '');
  if (/^Tone \d+$/.test(s)) return 'Tone #';
  if (/^\d+$/.test(s)) return '#';
  if (/^Checks(?::|$)/.test(s)) return 'Checks';
  return ALIASES[s] ?? s;
}

/** The text for a label where it is shown, with which entry and variant gave it; undefined when the label has none. */
export function pickHelp(label: string, where: HelpWhere = {}): HelpPick | undefined {
  const key = helpKey(label);
  const budget = /^Budget: (.+), (Low|Medium|High)$/.exec(key);
  if (budget) {
    const make = BUDGET_TEXT[budget[1]!];
    return make ? { key: `Budget: ${budget[1]!}`, variant: null, text: make(budget[2]!) + BUDGET_TAIL } : undefined;
  }
  const entry = HELP[key];
  if (entry === undefined) {
    const fresh = NEW_LABELS[key];
    return fresh === undefined ? undefined : { key, variant: null, text: fresh };
  }
  if (typeof entry === 'string') return { key, variant: null, text: entry };
  const path = sectionPath(where.section);
  // A title asked for with its own name at the end of its path: the sections around it are what count.
  if (where.title && path.length && path[path.length - 1] === label.trim()) path.pop();
  const inner = path[path.length - 1] ?? '';
  let kind = where.kind;
  if (kind === undefined) {
    for (const p of path) {
      const m = /^Shape: (\w+)$/.exec(p);
      const k = m?.[1] as ShapeKind | undefined;
      if (k && SHAPE_KINDS.includes(k)) kind = k;
    }
  }
  const layer = where.layer ?? (kind !== undefined ? 'shape' : undefined);
  const when = entry.when ?? [];
  for (let i = 0; i < when.length; i++) {
    const w = when[i]!;
    if (w.title && !where.title) continue;
    if (w.in !== undefined && !listOf(w.in).includes(inner)) continue;
    if (w.layer !== undefined && (layer === undefined || !listOf(w.layer).includes(layer))) continue;
    if (w.kind !== undefined && (kind === undefined || !listOf(w.kind).includes(kind))) continue;
    return { key, variant: i, text: w.text };
  }
  return { key, variant: null, text: entry.text };
}

/** The tooltip text for a label where it is shown; undefined when the label has none. */
export function helpFor(label: string, where: HelpWhere = {}): string | undefined {
  return pickHelp(label, where)?.text;
}

/** The keyboard shortcut for a control, for the tooltip's kbd; undefined when it has none. */
export function shortcutFor(label: string): string | undefined {
  return SHORTCUTS[label.trim()];
}

/**
 * Texts for the controls this round adds (F1, F2, F5, F6, F7), written from the round's spec, not from committed code,
 * for the integrator to use directly (the lines and tags that have no label of their own).
 */
export const NEW_THIS_ROUND = {
  /** F1: the toggle in the bar above the preview ("Fade other layers"). */
  fadeOtherLayers: NEW_LABELS['Fade other layers']!,
  /** F2: the live picture at the top of a layer's panel. */
  look: 'A live picture of this layer alone, drawn by the game\'s code on the ground colour and playing its own time in a loop.',
  /** F5: the "Show all" toggle next to a Colour heading. */
  showAll: NEW_LABELS['Show all']!,
  /** F5: the sprite's Colour section once it lists the layer's colours (HELP's text is true before and after F5). */
  spriteColourAfterF5: 'Whether the image keeps its own colours or is tinted with a colour from the palette, and the palette colours this layer uses.',
  /** F6: the effect's name in the layer panel's header (shortcut Esc). */
  backToEffect: 'Back to the effect\'s own settings.',
  /** F7: the "Layers riding it" section of a projectile's panel. */
  layersRidingIt: NEW_LABELS['Layers riding it']!,
  /** F7: the tag "rides Shell" in the Layers list. */
  ridesTag: (projectile: string): string => `This layer rides the projectile "${projectile}": it moves along its path.`,
  /** F7: "Drawn in code, no image" (a shape, a word, a burst of drawn pieces). */
  drawnInCode: 'The game draws this layer in code, from its settings: it needs no image.',
  /** F7: "Image: <file>" (a sprite, a burst of image pieces). */
  drawnFromImage: (file: string): string => `This layer shows the image ${file} from the project's images folder.`,
  /** F7: "An invisible path: it draws nothing itself" (a projectile). */
  invisiblePath: 'A projectile draws nothing itself: it is the path that the layers riding it follow.',
} as const;
