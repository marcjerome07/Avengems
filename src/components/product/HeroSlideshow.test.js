import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const vite = await createServer({ configFile: false, plugins: [react()],
  ssr: { external: ['react', 'react-dom', 'react-router-dom', 'lucide-react'] },
  server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
after(() => vite.close());
const { default: HeroSlideshow } = await vite.ssrLoadModule('/src/components/product/HeroSlideshow.jsx');

const render = () => renderToString(createElement(MemoryRouter, null, createElement(HeroSlideshow)))
  .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('<!-- -->', '');
const images = readdirSync(new URL('../../assets/featured/', import.meta.url)).filter((name) => /\.(png|jpe?g|webp|avif|gif)$/i.test(name));
const modelFile = images.find((name) => /^model\./i.test(name));
const activeImg = (html) => /<img [^>]*class="hero-slides__img is-active"[^>]*>/.exec(html)[0];

test('model is always the first slide, with no caption, and the live region says "Slide 1 of N"', () => {
  assert.ok(modelFile, 'src/assets/featured should contain model.*');
  for (let i = 0; i < 20; i += 1) {
    const html = render();
    assert.match(activeImg(html), new RegExp(`src="[^"]*/${modelFile.replace('.', '\\.')}"`));
    assert.equal(html.includes('hero-slides__caption'), false, 'model has no product caption');
    assert.ok(html.includes(`aria-live="off" aria-atomic="true">Slide 1 of ${images.length}: Featured Avengems jewelry</p>`));
  }
});

test('the page dots are gone; the arrows remain with their labels', () => {
  const html = render();
  assert.equal(html.includes('hero-slides__dot'), false);
  assert.ok(html.includes('aria-label="Previous slide"') && html.includes('aria-label="Next slide"'));
  const css = readFileSync(new URL('./HeroSlideshow.css', import.meta.url), 'utf8');
  assert.equal(/hero-slides__dot/.test(css), false);
  assert.match(css, /\.hero-slides__arrow:focus-visible/);
});

test('only the current slide and the next one are in the page at first (no eager folder download)', () => {
  const imgs = render().match(/<img [^>]*>/g) ?? [];
  assert.equal(imgs.length, 2);
  assert.ok(activeImg(imgs.join('')).includes('fetchPriority="high"'));
  assert.match(imgs.find((tag) => !tag.includes('is-active')), /alt="" aria-hidden="true"/);
});

test('the photo after model changes between page loads, and is never model again', () => {
  const seconds = new Set();
  for (let i = 0; i < 30; i += 1) {
    const hidden = (render().match(/<img [^>]*>/g) ?? []).find((tag) => !tag.includes('is-active'));
    const src = /src="([^"]+)"/.exec(hidden)[1];
    assert.equal(src.toLowerCase().includes('/model.'), false);
    seconds.add(src);
  }
  assert.ok(seconds.size > 1, '30 page loads should not all have the same second slide');
});

test('the interval is one named 4-second constant', () => {
  const source = readFileSync(new URL('./HeroSlideshow.jsx', import.meta.url), 'utf8');
  assert.match(source, /^const SLIDE_INTERVAL_MS = 4000;$/m);
});
