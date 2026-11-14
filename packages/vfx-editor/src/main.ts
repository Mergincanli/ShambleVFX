import "./style.css";
// Temporary: the preview alone, to judge the scene. The editor UI replaces this.
import paletteJson from '@shamble/vfx-format/palette.json';
import type { FactionId, Palette } from '@shamble/vfx-format';
import { Preview } from './preview/Preview';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
app.style.cssText = 'position:fixed;inset:0;';
const preview = await Preview.create({ container: app, palette: paletteJson as Palette, backend: params.get('backend') === 'webgl' ? 'webgl' : 'auto', offscreen: params.get('offscreen') === '1' });
preview.setFaction((params.get('faction') ?? 'soviets') as FactionId);
if (params.get('on')) preview.closeOn = params.get('on') as 'origin' | 'target';
if (params.get('view')) preview.setView(params.get('view') as 'whole' | 'game' | 'close');
await preview.render(() => {});
(window as unknown as { __ready: boolean }).__ready = true;
const loop = async () => { await preview.render(() => {}); requestAnimationFrame(loop); };
if (!params.get('offscreen')) requestAnimationFrame(loop);
