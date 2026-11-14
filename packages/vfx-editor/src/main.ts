/**
 * Shamble VFX editor: start-up.
 */
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/ibm-plex-sans/400';
import '@fontsource/ibm-plex-sans/500';
import '@fontsource/ibm-plex-sans/600';
import '@fontsource/ibm-plex-mono/400';
import '@fontsource/ibm-plex-mono/500';
import './style.css';
import { App } from './app/App';

const root = document.getElementById('app')!;
App.start(root)
  .then((app) => {
    (window as unknown as { __vfx: unknown }).__vfx = { app, ready: true };
  })
  .catch((e: unknown) => {
    root.innerHTML = '';
    const p = document.createElement('pre');
    p.className = 'fatal';
    p.textContent = `Shamble VFX could not start.\n\n${(e as Error)?.stack ?? String(e)}`;
    root.append(p);
    (window as unknown as { __vfx: unknown }).__vfx = { ready: true, error: String(e) };
  });
