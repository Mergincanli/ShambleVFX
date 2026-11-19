// Screenshots of the editor's UI, for the redesign in docs/ui-redesign.md: the same states every time, in Day and Night,
// at 2560 x 1440 and 1920 x 1080. Each picture pauses the effect at a set time with a set seed, so two runs match.
//   node tools/ui-shots.mjs                                   all states: out/ui/<state>-<day|night>-<2560|1920>.png
//   node tools/ui-shots.mjs --prefix before                   out/ui/before-<state>-<theme>-<width>.png
//   node tools/ui-shots.mjs --only picker,beam-layer          only these states (a quick run)
//   node tools/ui-shots.mjs --fields out/ui/fields-before.json
//        also writes the settings inventory: every section title and setting label of the right panel, for each effect
//        of the two example projects and for each of their layers (phase 6 of the redesign compares against it)
// It starts the editor's dev server the way tools/browser-check.mjs does, and draws with WebGL 2 (?backend=webgl).
// Pictures and the inventory go to out/, which git ignores.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repo, 'out', 'ui');
const DEMO = 'examples/demo-project';
const HITS = 'examples/hits-collection';
const SEED = 7;

// The states. To add one, add an entry:
//   effect and ms     the effect (by id) and the moment it is paused at: the same for every picture of the state
//   layer             a layer id, or 'first:<type>' for the first layer of that type in the effect's file
//   picker            true: the colour picker is open on the effect's main colour
//   menu              true: a menu is open (act opens it: the main menu, a chip's, an effect row's, the add menu); the
//                     picture is checked for it
//   popover           true: the Distance popover is open (act opens it); the picture is checked for it
//   query             more of the address, such as 'hints=off' (Show hints off for the picture; the picture is checked for it)
//   act(page)         optional, in Node, after the selection and the picker and before the effect is drawn: for clicks
//                     and keys with Playwright's real mouse and keyboard
//   hover(page)       optional: a Playwright locator to rest the pointer on until its tooltip opens, after the effect is
//                     drawn and just before the picture (drawing can move the panel: the Look's line comes in), so the
//                     picture has that tooltip open
const STATES = [
  { name: 'rifle-effect', project: DEMO, effect: 'rifle_shot', ms: 20 },
  // The first sprite in the effect's file is the Tracer (the Layers list shows the file upside down: second from the bottom).
  { name: 'rifle-sprite', project: DEMO, effect: 'rifle_shot', ms: 20, layer: 'first:sprite' },
  // Emitter glow: third from the top, so it shows in the Layers list and on the timeline without scrolling. It is the
  // layer the browser check uses, and a glow, so its gradient field is in the panel.
  { name: 'beam-layer', project: DEMO, effect: 'board_beam', ms: 1000, layer: 'emitter_glow' },
  { name: 'picker', project: DEMO, effect: 'rifle_shot', ms: 20, picker: true },
  // A tooltip open: a field label's help text in the panel (the glow's Mixes), and a bar's button with its shortcut (Fire).
  { name: 'tooltip-label', project: DEMO, effect: 'board_beam', ms: 1000, layer: 'emitter_glow',
    hover: (page) => page.locator('.inspector details', { has: page.locator(':scope > summary', { hasText: /^Place$/ }) }).locator('.flab', { hasText: /^Mixes$/ }) },
  { name: 'tooltip-button', project: DEMO, effect: 'rifle_shot', ms: 20, hover: (page) => page.locator('.vbar button.fire') },
  // (e) a menu open: the main menu, from the logo (UI phase 2); a chip's menu, from the viewport toolbar (UI phase 3): the
  // Faction chip's (markings and team colours) and the View chip's (shortcuts, a heading, the scale in the chip).
  { name: 'menu', project: DEMO, effect: 'rifle_shot', ms: 20, menu: true, act: (page) => openFrom(page, '.topbar .logo', '#main-menu') },
  { name: 'faction-menu', project: DEMO, effect: 'rifle_shot', ms: 20, menu: true, act: (page) => openFrom(page, '.vbar .faction-chip', '#faction-menu') },
  { name: 'view-menu', project: DEMO, effect: 'rifle_shot', ms: 20, menu: true, act: (page) => openFrom(page, '.vbar .view-chip', '#view-menu') },
  // The lists (UI phase 4): an effect row's menu, from the More button of the selected row (Rename, Duplicate, Move to
  // folder…, Delete); and the Layers header's add menu (the kinds, the 14 shapes), with a layer selected.
  { name: 'effect-menu', project: DEMO, effect: 'rifle_shot', ms: 20, menu: true, act: (page) => openFrom(page, '.effects-list .item.sel .more', '#effect-menu') },
  { name: 'add-menu', project: DEMO, effect: 'board_beam', ms: 1000, layer: 'emitter_glow', menu: true, act: (page) => openFrom(page, '.layers-section .add-layer', '#add-layer-menu') },
  // Show hints off (UI phase 3): the effect's own view, which has the most hints, and the drag hint over the preview gone.
  { name: 'hints-off', project: DEMO, effect: 'rifle_shot', ms: 20, query: 'hints=off' },
  // The Distance popover, in the tank shell's scene (you are in it: the distance moves the target).
  { name: 'distance-popover', project: DEMO, effect: 'board_shell', ms: 300, popover: true, act: (page) => openFrom(page, '.vbar .distance-chip', '#distance-popover') },
  // The timeline (UI phase 5): the Hammer leech beam at 20 ms, where the playhead crosses the first digit of "3150 ms", the
  // "w" of "wind-up" and the ruler's 0. The Lock ring, near the bottom, is selected: at 1920 x 1080 the rows scroll to it,
  // under the ruler and the phase strip, which stay at the top. (rifle-effect shows the Bullet's label beside its bar.)
  { name: 'timeline', project: DEMO, effect: 'board_beam', ms: 20, layer: 'lock_ring' },
];
/** Click a button and wait for what it opens (a menu, a popover). */
async function openFrom(page, button, what) {
  await page.click(button);
  await page.waitForSelector(`${what}:popover-open`, { timeout: 10000 });
}
/** Rest the pointer on an element until its tooltip opens (after the hover delay). Nothing it hovers is built again later. */
async function hoverForTooltip(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  // A scroll hides the tooltip (and one waiting): let the scroll's event pass first.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + Math.min(12, box.width / 2), box.y + box.height / 2);
  await page.waitForSelector('.tooltip:popover-open', { timeout: 10000 });
}
const THEMES = [{ name: 'day', param: 'light' }, { name: 'night', param: 'dark' }];
const SIZES = [{ width: 2560, height: 1440 }, { width: 1920, height: 1080 }];
// What the colour picker opens from: the first of these that exists. Today it is the main colour's swatch in the Effect
// card. Phase 6 replaces the swatch grid with an edit button next to the main colour: put that button first then.
const PICKER_ANCHORS = ['.inspector .swatch[aria-current="true"]', '.inspector .bigcontrols', '.inspector'];

// ---------------------------------------------------------------- options
const USAGE = 'Usage: node tools/ui-shots.mjs [--prefix <word>] [--only <state,...>] [--fields <file.json>]\n'
  + `States: ${STATES.map((s) => s.name).join(', ')}`;
const opts = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') { console.log(USAGE); process.exit(0); }
    const m = /^--(prefix|only|fields)(?:=(.*))?$/.exec(argv[i]);
    if (!m) { console.error(`Unknown option: ${argv[i]}\n${USAGE}`); process.exit(2); }
    const v = m[2] ?? argv[++i];
    if (!v || v.startsWith('--')) { console.error(`--${m[1]} needs a value.\n${USAGE}`); process.exit(2); }
    opts[m[1]] = v;
  }
}
if (opts.prefix !== undefined && !/^[A-Za-z0-9_-]+$/.test(opts.prefix)) { console.error('--prefix takes one word: letters, digits, - and _.'); process.exit(2); }
const prefix = opts.prefix ? `${opts.prefix}-` : '';
const only = opts.only ? opts.only.split(',').map((s) => s.trim()).filter(Boolean) : null;
const unknown = (only ?? []).filter((n) => !STATES.some((s) => s.name === n));
if (unknown.length) { console.error(`No state called ${unknown.join(', ')}.\n${USAGE}`); process.exit(2); }
const states = only ? STATES.filter((s) => only.includes(s.name)) : STATES;
const fieldsFile = opts.fields ? resolve(process.cwd(), opts.fields) : null;
/** A path as printed: from the repo's root when it is inside the repo. */
const shown = (f) => { const r = relative(repo, f); return r.startsWith('..') ? f : r; };

// ---------------------------------------------------------------- in the page

/** Pick the effect and the layer, with the clock stopped. Runs in the browser; returns a problem, or nothing. */
async function select({ effect, layer }) {
  const a = window.__vfx.app;
  window.__vfxManual = true;
  if (!(await a.setupForChecks({ effect }))) return `the project has no effect "${effect}"`;
  if (layer) {
    const fx = a.effect();
    const l = layer.startsWith('first:') ? fx.layers.find((x) => x.type === layer.slice(6)) : fx.layers.find((x) => x.id === layer);
    if (!l) return `"${effect}" has no layer ${layer}`;
    a.selectLayer(l.id);
  }
  return null;
}

/** Open the colour picker on the effect's main colour, from the first anchor that exists. Runs in the browser. */
function openPicker(anchors) {
  const a = window.__vfx.app;
  const anchor = anchors.map((s) => document.querySelector(s)).find(Boolean);
  if (!anchor) return 'nothing to open the colour picker from';
  anchor.scrollIntoView({ block: 'nearest' });
  a.openColourPicker(a.effect().controls.colour, anchor);
  return null;
}

/** Show the effect paused at ms with the seed (twice, as the browser check does). Runs in the browser. */
async function draw({ ms, seed }) {
  const a = window.__vfx.app;
  await a.showAt(ms, seed);
  await a.showAt(ms, seed);
  // The message that says the project opened slides away by itself: take it away now.
  document.querySelector('.status')?.classList.remove('show');
}

/** What the page shows, for the checks in Node. Runs in the browser. */
function describe() {
  const a = window.__vfx.app;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  return {
    effect: a.effect()?.id ?? null, effectName: a.effect()?.name ?? null, layer: a.layer()?.id ?? null, layerName: a.layer()?.name ?? null,
    theme: document.documentElement.dataset.theme, hints: document.documentElement.dataset.hints, pickerOpen: !!document.querySelector('.cpick')?.matches(':popover-open'),
    tooltipOpen: !!document.querySelector('.tooltip')?.matches(':popover-open'),
    menuOpen: !!document.querySelector('.menu:popover-open'),
    popoverOpen: !!document.querySelector('.popover:popover-open'),
    role: a.effect()?.controls.colour ?? null,
    // For the check that the preview is drawn: the game frame, and what lies over it.
    frame: box(document.querySelector('.frame-guide')) ?? box(document.querySelector('.viewport')),
    viewport: box(document.querySelector('.viewport')),
    covers: ['.frame-label', '.vhint', '.cpick:popover-open', '.menu:popover-open', '.popover:popover-open', '.tooltip:popover-open'].map((s) => box(document.querySelector(s))).filter(Boolean),
    // With a layer selected: the Look, the live picture at the top of its panel (held at a moment from the one shown).
    look: box(document.querySelector('.inspector .look-box')),
    lookState: a.lookForChecks?.() ?? null,
  };
}

/**
 * The settings inventory of the open project. Runs in the browser. For each effect (in id order): its own view, with no
 * layer selected; then each layer (in the order of the effect file), selected, and read from its own card. With a layer
 * selected the panel shows that layer's settings, not the effect's (a header leads back to them): the layer's card holds
 * them all, and the reader stops if it is missing or if the effect's settings show too.
 */
function readInventory() {
  const a = window.__vfx.app;
  window.__vfxManual = true;
  const inspector = document.querySelector('.inspector');
  // How today's panel is made (src/app/inspector.ts, specform.ts, dom.ts, costcard.ts): sections are the cards and the
  // folds; a setting is named by a slider's label, a row's name (segmented buttons, the palette, Phases, Shows in), a
  // field's label (numbers, text, selects) or a checkbox's label. Inputs with no label (the cost budgets) go by their
  // aria-label. Every control must end up named, or the inventory stops: nothing is left out without notice.
  const SECTION = 'section.card, details';
  const LABEL = '.lab > label, .lab > span:first-child:not(.hint):not(.val), .flab, label.check';
  const CONTROL = 'input, select, textarea, .seggroup, .swatches';
  const CONTAINER = 'label.field, .field, label.check, .row';
  const text = (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
  const titleOf = (sec) => text(sec.matches('details') ? sec.querySelector(':scope > summary') : sec.querySelector(':scope > h2, :scope > .card-head > h2'));

  const read = (scope) => {
    const inScope = (el, sel) => { const c = el.closest(sel); return c && scope.contains(c) ? c : null; };
    const titlePath = (sec) => {
      const names = [titleOf(sec)];
      for (let p = sec.parentElement?.closest('details'); p && scope.contains(p); p = p.parentElement?.closest('details')) names.unshift(titleOf(p));
      return names.join(' > ');
    };
    // Hidden by the layer's state (display: none on it or round it), not merely inside a closed fold.
    const hidden = (el) => { for (let n = el; n && n !== scope.parentElement; n = n.parentElement) if (getComputedStyle(n).display === 'none') return true; return false; };
    const nameOf = (el) => {
      if (el.matches('label.check')) return el.querySelector('input')?.getAttribute('aria-label') || text(el.querySelector(':scope > span'));
      const t = text(el);
      if (el.matches('.flab') && (t === '' || t === '…')) {
        // The second and third box of a generated pair or group of three: named after the first box.
        const field = el.closest('.field');
        const boxes = field?.parentElement?.matches('.fieldrow') ? [...field.parentElement.children].filter((c) => c.matches('.field')) : [];
        const first = boxes.length ? text(boxes[0].querySelector('.flab')) : '';
        return first && first !== '…' ? `${first} (${boxes.indexOf(field) + 1})` : '';
      }
      return t;
    };
    const sections = [];
    const bySection = new Map();
    for (const sec of [...(scope.matches(SECTION) ? [scope] : []), ...scope.querySelectorAll(SECTION)]) {
      const s = { title: titlePath(sec), fields: [], hidden: [] };
      sections.push(s);
      bySection.set(sec, s);
    }
    let loose = null;
    for (const el of scope.querySelectorAll(`${LABEL}, ${CONTROL}`)) {
      let name;
      if (el.matches(LABEL)) name = nameOf(el);
      else {
        const box = inScope(el, CONTAINER);
        if (box && (box.matches(LABEL) || box.querySelector(LABEL))) continue; // named by its label, recorded above
        name = (el.getAttribute('aria-label') ?? '').trim();
      }
      if (!name) throw new Error(`a setting with no name: ${el.outerHTML.slice(0, 160)}`);
      const sec = inScope(el, SECTION);
      let s = sec && bySection.get(sec);
      if (!s) { if (!loose) { loose = { title: '(outside any section)', fields: [], hidden: [] }; sections.unshift(loose); } s = loose; }
      s.fields.push(name);
      if (hidden(el)) s.hidden.push(name);
    }
    return sections.map((s) => (s.hidden.length ? s : { title: s.title, fields: s.fields }));
  };

  const effects = [];
  for (const id of a.debugState().effects.slice().sort()) {
    a.pickEffect(id);
    const fx = a.effect();
    const entry = { id: fx.id, name: fx.name, effect: { sections: read(inspector) }, layers: [] };
    for (const l of fx.layers) {
      a.selectLayer(l.id);
      if (a.layer()?.id !== l.id) throw new Error(`could not select layer ${l.id} of ${fx.id}`);
      const card = inspector.querySelector('section.card.layer');
      if (!card) throw new Error(`layer ${l.id} of ${fx.id}: no layer card (section.card.layer) in the panel`);
      if (inspector.querySelector('.bigcontrols')) throw new Error(`layer ${l.id} of ${fx.id}: the effect's settings show next to the layer's`);
      entry.layers.push({ id: l.id, name: l.name, type: l.type, sections: read(card) });
    }
    a.selectLayer(null);
    effects.push(entry);
  }
  return effects;
}

const ABOUT = 'The settings inventory of the editor\'s right panel (the inspector), made by tools/ui-shots.mjs --fields. '
  + 'For each effect of the example projects: "effect" is its own view, with no layer selected (the Effect, Cost and Checks cards); '
  + '"layers" are its layers, each selected and read from its own card (with a layer selected, the panel shows that card under a header that leads back to the effect, '
  + 'then the Cost and Checks cards, which are the same for every layer, so they are listed once, in the effect\'s view). '
  + 'Sections are the cards and folds, in panel order; a fold inside a fold is called "Outer > Inner". A layer\'s card starts with the Look, its live picture, which holds no settings. '
  + '"fields" are the names of the settings in a section, in order: sliders, number, text and colour fields, selects, segmented buttons, the colour list, checkboxes (by the name a screen reader says), and inputs and lists that have only that name (the cost budgets, a layer\'s colour list). '
  + 'The second and third box of a generated pair or group of three are named after the first, with (2) and (3). '
  + '"hidden" lists the fields that exist but are hidden in that layer\'s current state (they show after another choice, such as Flipbook on). '
  + 'Buttons (actions such as Measure or Add PNG images, and a projectile\'s riders) are not listed. Effects are in id order; layers in the order of the effect file.';

// ---------------------------------------------------------------- the dev server and the browser
const failures = [];
const server = await createServer({ root: join(repo, 'packages', 'vfx-editor'), configFile: join(repo, 'packages', 'vfx-editor', 'vite.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1', open: false } });
let browser;
try {
  await server.listen();
  const base = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });

  /** A fresh page (and so fresh storage) per picture: nothing carries over from one state to the next. */
  const open = async (query, size) => {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/?${query}`);
    await page.waitForFunction(() => window.__vfx && window.__vfx.ready, null, { timeout: 60000 });
    const startError = await page.evaluate(() => window.__vfx.error);
    if (startError) { await page.close(); throw new Error(`the editor did not start: ${startError}`); }
    return { page, errors };
  };

  /**
   * Wait until the page holds still: laid out with its fonts and images in, two frames drawn (the preview's resize
   * observer runs by then), and the colour picker, which may grow and move, in its place.
   */
  const settle = async (page, picker) => {
    await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      for (let k = 0; k < 2; k++) {
        void document.body.offsetHeight; // lay out now, so the fonts the new text needs start loading
        await document.fonts.ready;
        await Promise.all([...document.images].map((im) => im.decode().catch(() => {})));
        await frame();
        await frame();
      }
    });
    if (picker) {
      let box = await page.locator('.cpick').boundingBox();
      for (let k = 0; k < 40; k++) {
        await page.waitForTimeout(50);
        const again = await page.locator('.cpick').boundingBox();
        if (box && again && ['x', 'y', 'width', 'height'].every((q) => Math.abs(box[q] - again[q]) < 0.5)) break;
        box = again;
      }
    }
  };

  /**
   * The preview must be drawn: inside the game frame (less what lies over it) there is drawn ground, and something
   * that is not ground (the shade band, the stand-in, the effect). A blank canvas shows only the colour behind it.
   */
  const ground = [0xB8, 0xA6, 0x83];
  const previewDrawn = (png, d) => {
    const v = d.viewport, f = d.frame;
    if (!v || !f) return 'no preview on the page';
    const x0 = Math.ceil(Math.max(v.x, f.x) + 4), x1 = Math.floor(Math.min(v.x + v.w, f.x + f.w, png.width) - 4);
    const y0 = Math.ceil(Math.max(v.y, f.y) + 4), y1 = Math.floor(Math.min(v.y + v.h, f.y + f.h, png.height) - 4);
    const covered = (x, y) => d.covers.some((c) => x >= c.x - 2 && x <= c.x + c.w + 2 && y >= c.y - 2 && y <= c.y + c.h + 2);
    let n = 0, isGround = 0, other = 0;
    for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) {
      if (covered(x, y)) continue;
      const i = (y * png.width + x) * 4;
      const off = Math.max(...ground.map((g, k) => Math.abs(png.data[i + k] - g)));
      n++;
      if (off <= 2) isGround++; else if (off > 12) other++;
    }
    if (n < 100) return `too little of the preview to see (${n} samples)`;
    return isGround > n * 0.2 && other > n * 0.005 ? null : `the preview looks blank: ${isGround} of ${n} samples are ground, ${other} are something else`;
  };

  /** With a layer selected, the Look must be drawn: the ground colour, and the layer on it (its corners left out). */
  const lookDrawn = (png, d) => {
    const b = d.look;
    if (!b) return 'no Look in the layer\'s panel';
    if (!d.lookState?.ready) return 'the Look did not get its renderer';
    let n = 0, isGround = 0, other = 0;
    for (let y = Math.ceil(b.y + 4); y < Math.min(b.y + b.h - 4, png.height); y += 2) for (let x = Math.ceil(b.x + 4); x < Math.min(b.x + b.w - 4, png.width); x += 2) {
      const i = (y * png.width + x) * 4;
      const off = Math.max(...ground.map((g, k) => Math.abs(png.data[i + k] - g)));
      n++;
      if (off <= 2) isGround++; else if (off > 24) other++;
    }
    return isGround > n * 0.2 && other >= 20 ? null : `the Look looks blank: ${isGround} of ${n} samples are ground, ${other} are something else`;
  };

  mkdirSync(outDir, { recursive: true });
  for (const state of states) {
    let told = false;
    for (const theme of THEMES) {
      for (const size of SIZES) {
        const file = join(outDir, `${prefix}${state.name}-${theme.name}-${size.width}.png`);
        const { page, errors } = await open(`backend=webgl&theme=${theme.param}&project=${state.project}${state.query ? `&${state.query}` : ''}`, size);
        try {
          const problem = await page.evaluate(select, { effect: state.effect, layer: state.layer ?? null });
          if (problem) throw new Error(problem);
          await settle(page, false);
          if (state.picker) { const p = await page.evaluate(openPicker, PICKER_ANCHORS); if (p) throw new Error(p); }
          if (state.act) await state.act(page);
          // Draw last, and twice round a settle, so the picture holds still: fonts and images in, the colour picker in its
          // place. (A change of the preview's size clears its canvas; the editor draws the moment again by itself then.)
          await page.evaluate(draw, { ms: state.ms, seed: SEED });
          await settle(page, state.picker);
          await page.evaluate(draw, { ms: state.ms, seed: SEED });
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
          if (state.hover) await hoverForTooltip(page, state.hover(page));
          const got = await page.evaluate(describe);
          const wrong = [];
          if (got.theme !== theme.param) wrong.push(`theme is ${got.theme}, want ${theme.param}`);
          const wantHints = /(^|&)hints=off(&|$)/.test(state.query ?? '') ? 'off' : 'on';
          if (got.hints !== wantHints) wrong.push(`Show hints is ${got.hints}, want ${wantHints}`);
          if (got.effect !== state.effect) wrong.push(`effect is ${got.effect}, want ${state.effect}`);
          if (!state.layer && got.layer !== null) wrong.push(`layer ${got.layer} is selected, want none`);
          if (state.layer && !state.layer.startsWith('first:') && got.layer !== state.layer) wrong.push(`layer is ${got.layer}, want ${state.layer}`);
          if (state.layer?.startsWith('first:') && !got.layer) wrong.push('no layer is selected');
          if (!!state.picker !== got.pickerOpen) wrong.push(`the colour picker is ${got.pickerOpen ? 'open' : 'closed'}`);
          if (!!state.hover !== got.tooltipOpen) wrong.push(`a tooltip is ${got.tooltipOpen ? 'open' : 'not open'}`);
          if (!!state.menu !== got.menuOpen) wrong.push(`a menu is ${got.menuOpen ? 'open' : 'closed'}`);
          if (!!state.popover !== got.popoverOpen) wrong.push(`the Distance popover is ${got.popoverOpen ? 'open' : 'closed'}`);
          const png = PNG.sync.read(await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' }));
          const blank = previewDrawn(png, got);
          if (blank) wrong.push(blank);
          if (state.layer) { const look = lookDrawn(png, got); if (look) wrong.push(look); }
          if (png.width !== size.width || png.height !== size.height) wrong.push(`the picture is ${png.width} x ${png.height}`);
          if (!told) {
            console.log(`${state.name}: ${got.effectName}${got.layer ? `, layer "${got.layerName}" (${got.layer})` : ', no layer'}${state.picker ? `, colour picker on ${got.role}` : ''}; ${state.ms} ms, seed ${SEED}`);
            told = true;
          }
          if (errors.length) wrong.push(`the page reported errors: ${errors.slice(0, 2).join(' | ')}`);
          if (wrong.length) throw new Error(wrong.join('; '));
          console.log(shown(file));
        } catch (e) {
          failures.push(`${shown(file)}: ${e.message}`);
          console.log(`FAIL  ${shown(file)}: ${e.message}`);
        } finally {
          await page.close();
        }
      }
    }
  }

  // ---------------------------------------------------------------- the settings inventory
  if (fieldsFile) {
    const projects = [];
    for (const project of [DEMO, HITS]) {
      const { page, errors } = await open(`backend=webgl&project=${project}`, SIZES[1]);
      try {
        const effects = await page.evaluate(readInventory);
        // The editor opens another project when it cannot open the one asked for: check it is the right one, all of it.
        const onDisk = readdirSync(join(repo, project, 'effects')).filter((f) => f.endsWith('.vfx.json')).sort()
          .map((f) => JSON.parse(readFileSync(join(repo, project, 'effects', f), 'utf8')));
        const want = onDisk.map((fx) => `${fx.id}:${fx.layers.map((l) => l.id).join(',')}`).sort().join(' ');
        const got = effects.map((fx) => `${fx.id}:${fx.layers.map((l) => l.id).join(',')}`).sort().join(' ');
        if (got !== want) throw new Error(`the editor's effects and layers are not the ones in ${project}/effects`);
        if (errors.length) throw new Error(`the page reported errors: ${errors.slice(0, 2).join(' | ')}`);
        projects.push({ project, effects });
        console.log(`${project}: ${effects.length} effects, ${effects.reduce((n, fx) => n + fx.layers.length, 0)} layers`);
      } catch (e) {
        failures.push(`inventory of ${project}: ${e.message}`);
        console.log(`FAIL  inventory of ${project}: ${e.message}`);
      } finally {
        await page.close();
      }
    }
    if (projects.length === 2) {
      mkdirSync(dirname(fieldsFile), { recursive: true });
      writeFileSync(fieldsFile, JSON.stringify({ about: ABOUT, projects }, null, 2) + '\n');
      console.log(shown(fieldsFile));
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}:\n${failures.join('\n')}`);
  process.exit(1);
}
