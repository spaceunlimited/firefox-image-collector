// Tests for the injected SVG probe functions, run against jsdom with stubbed
// computed styles (jsdom has no real SVG style cascade) and a stubbed clipboard.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { probeSvg, probeSvgPresence, probeSvgDocument, copyText } from '../../content/probe.js';

const INITIAL = {
  fill: 'rgb(0, 0, 0)',
  'fill-opacity': '1',
  'fill-rule': 'nonzero',
  stroke: 'none',
  'stroke-width': '1px',
  'stroke-opacity': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-dasharray': 'none',
  'stroke-dashoffset': '0px',
  opacity: '1',
  visibility: 'visible',
  'stop-color': 'rgb(0, 0, 0)',
  'stop-opacity': '1',
};

let dom;
let doc;
const targets = new Map();
const styles = new Map();
let clipboard;
let clipboardFails;

function setupDom(html, { contentType, url = 'http://localhost:8000/page.html' } = {}) {
  dom = new JSDOM(html, contentType ? { contentType, url } : { url });
  doc = dom.window.document;
  dom.window.getComputedStyle = (el) => {
    const own = styles.get(el) ?? {};
    return {
      getPropertyValue: (p) => own[p] ?? INITIAL[p] ?? '',
      get display() {
        return own.display ?? 'inline';
      },
    };
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: doc,
    XMLSerializer: dom.window.XMLSerializer,
    location: dom.window.location,
  });
  globalThis.browser = { menus: { getTargetElement: (id) => targets.get(id) ?? null } };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (t) => {
          if (clipboardFails) throw new Error('clipboard unavailable');
          clipboard.push(t);
        },
      },
    },
  });
  return doc;
}

const rectOf = (el, width, height) => {
  el.getBoundingClientRect = () => ({ width, height, top: 0, left: 0, right: width, bottom: height });
};

beforeEach(() => {
  targets.clear();
  styles.clear();
  clipboard = [];
  clipboardFails = false;
});

test('probeSvg returns null off-target', async () => {
  setupDom('<p id="p">text</p>');
  targets.set(1, doc.getElementById('p'));
  assert.equal(await probeSvg(1), null);
  assert.equal(await probeSvg(2), null);
});

test('probeSvg serializes the outermost svg, adds xmlns, copies the text', async () => {
  setupDom('<svg id="outer" width="24" height="24"><svg id="inner" x="4"><path id="p" d="M0 0h8"/></svg></svg>');
  const svg = doc.getElementById('outer');
  rectOf(svg, 24, 24);
  targets.set(1, doc.getElementById('p'));
  const out = await probeSvg(1);
  assert.ok(out.svgText.includes('id="outer"'));
  assert.ok(out.svgText.includes('id="inner"'));
  assert.ok(out.svgText.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.equal(out.copied, true);
  assert.deepEqual(clipboard, [out.svgText]);
  assert.equal(out.renderedWidth, 24);
});

test('probeSvg reports copied: false when the page clipboard fails', async () => {
  setupDom('<svg id="s" width="10" height="10"><rect id="r"/></svg>');
  rectOf(doc.getElementById('s'), 10, 10);
  targets.set(1, doc.getElementById('r'));
  clipboardFails = true;
  const out = await probeSvg(1);
  assert.equal(out.copied, false);
  assert.ok(out.svgText.includes('<rect'));
});

test('probeSvg bakes non-initial computed styles and skips initial and url() values', async () => {
  setupDom('<svg id="s" width="10" height="10"><path id="a"/><path id="b"/></svg>');
  rectOf(doc.getElementById('s'), 10, 10);
  styles.set(doc.getElementById('a'), { fill: 'rgb(102, 51, 153)', 'stroke-width': '1px' });
  styles.set(doc.getElementById('b'), { fill: 'url("http://localhost:8000/#g") rgb(0, 0, 0)' });
  targets.set(1, doc.getElementById('a'));
  const out = await probeSvg(1);
  assert.ok(out.styled);
  assert.ok(out.svgText.includes('fill: rgb(102, 51, 153)'));
  assert.ok(!out.svgText.includes('stroke-width'));
  assert.ok(!out.svgText.includes('url(&quot;http'));
  const copy = new JSDOM(out.svgText, { contentType: 'image/svg+xml' }).window.document;
  assert.equal(copy.getElementById('b').getAttribute('style'), null);
});

test('probeSvg appends baked styles after existing inline style', async () => {
  setupDom('<svg id="s" width="10" height="10"><path id="a" style="fill-rule: evenodd;"/></svg>');
  rectOf(doc.getElementById('s'), 10, 10);
  styles.set(doc.getElementById('a'), { fill: 'rgb(1, 2, 3)' });
  targets.set(1, doc.getElementById('a'));
  const out = await probeSvg(1);
  const copy = new JSDOM(out.svgText, { contentType: 'image/svg+xml' }).window.document;
  assert.match(copy.getElementById('a').getAttribute('style'), /fill-rule: evenodd; fill: rgb\(1, 2, 3\)$/);
});

test('probeSvg pulls referenced sprite symbols and gradients into defs, recursively', async () => {
  setupDom(`
    <svg id="icon" width="16" height="16"><use href="#sym"/></svg>
    <svg style="display:none"><symbol id="sym"><rect fill="url(#grad)" width="8" height="8"/></symbol></svg>
    <svg style="display:none"><defs><linearGradient id="grad"><stop offset="0"/></linearGradient></defs></svg>
  `);
  const svg = doc.getElementById('icon');
  rectOf(svg, 16, 16);
  targets.set(1, svg.querySelector('use'));
  const out = await probeSvg(1);
  const copy = new JSDOM(out.svgText, { contentType: 'image/svg+xml' }).window.document;
  assert.ok(copy.getElementById('sym'), 'symbol cloned into the capture');
  assert.ok(copy.getElementById('grad'), 'gradient referenced by the symbol cloned too');
  assert.equal(copy.querySelectorAll('defs').length, 1);
});

test('probeSvg declares xmlns:xlink when xlink:href attributes are present', async () => {
  setupDom(`
    <svg id="icon" width="16" height="16"><use xlink:href="#sym"/></svg>
    <svg style="display:none"><symbol id="sym"><rect/></symbol></svg>
  `);
  const svg = doc.getElementById('icon');
  rectOf(svg, 16, 16);
  targets.set(1, svg.querySelector('use'));
  const out = await probeSvg(1);
  assert.ok(out.svgText.includes('xmlns:xlink="http://www.w3.org/1999/xlink"'));
  const copy = new JSDOM(out.svgText, { contentType: 'image/svg+xml' }).window.document;
  assert.ok(copy.getElementById('sym'));
});

test('probeSvg sets width/height from the rendered size when attributes are missing', async () => {
  setupDom('<svg id="s" viewBox="0 0 24 12"><rect id="r"/></svg>');
  const svg = doc.getElementById('s');
  rectOf(svg, 48, 24);
  targets.set(1, doc.getElementById('r'));
  const out = await probeSvg(1);
  assert.ok(out.svgText.includes('width="48"'));
  assert.ok(out.svgText.includes('height="24"'));
  assert.equal(out.renderedWidth, 48);
  assert.equal(out.renderedHeight, 24);
});

test('probeSvg skips style inlining for huge SVGs', async () => {
  const rects = Array.from({ length: 1001 }, (_, i) => `<rect id="r${i}"/>`).join('');
  setupDom(`<svg id="s" width="10" height="10">${rects}</svg>`);
  const svg = doc.getElementById('s');
  rectOf(svg, 10, 10);
  styles.set(doc.getElementById('r0'), { fill: 'rgb(102, 51, 153)' });
  targets.set(1, doc.getElementById('r0'));
  const out = await probeSvg(1);
  assert.equal(out.styled, false);
  assert.ok(!out.svgText.includes('style='));
});

test('probeSvg resolves object/embed SVG targets to their file URL', async () => {
  setupDom(`
    <object id="o" data="img/a.svg" type="image/svg+xml"></object>
    <embed id="e" src="b.svg">
    <object id="png" data="img/c.png"></object>
  `);
  targets.set(1, doc.getElementById('o'));
  targets.set(2, doc.getElementById('e'));
  targets.set(3, doc.getElementById('png'));
  assert.deepEqual(await probeSvg(1), { standalone: true, url: 'http://localhost:8000/img/a.svg' });
  assert.deepEqual(await probeSvg(2), { standalone: true, url: 'http://localhost:8000/b.svg' });
  assert.equal(await probeSvg(3), null);
});

test('probeSvg and probeSvgDocument handle a standalone SVG document', async () => {
  const url = 'http://localhost:8000/img/a.svg';
  setupDom('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"><rect/></svg>', {
    contentType: 'image/svg+xml',
    url,
  });
  assert.deepEqual(await probeSvg(1), { standalone: true, url });
  rectOf(doc.documentElement, 5, 5);
  const out = await probeSvgDocument(null);
  assert.ok(out.svgText.includes('<rect'));
  assert.equal(out.copied, true);
  assert.equal(out.renderedWidth, 5);
});

test('probeSvgDocument returns null on a normal page without an SVG target', async () => {
  setupDom('<p id="p">text</p>');
  targets.set(1, doc.getElementById('p'));
  assert.equal(await probeSvgDocument(1), null);
});

test('probeSvgPresence detects inline svg, svg object/embed and svg documents', async () => {
  setupDom(`
    <svg id="s"><rect id="r"/></svg>
    <object id="o" data="a.svg"></object>
    <embed id="e" src="movie.mp4">
    <p id="p">text</p>
    <img id="i" src="x.png">
  `);
  targets.set(1, doc.getElementById('r'));
  targets.set(2, doc.getElementById('o'));
  targets.set(3, doc.getElementById('e'));
  targets.set(4, doc.getElementById('p'));
  targets.set(5, doc.getElementById('i'));
  assert.equal(probeSvgPresence(1), true);
  assert.equal(probeSvgPresence(2), true);
  assert.equal(probeSvgPresence(3), false);
  assert.equal(probeSvgPresence(4), false);
  assert.equal(probeSvgPresence(5), false);
  assert.equal(probeSvgPresence(99), false);

  setupDom('<svg xmlns="http://www.w3.org/2000/svg"/>', { contentType: 'image/svg+xml', url: 'http://localhost:8000/a.svg' });
  assert.equal(probeSvgPresence(1), true);
});

test('copyText reports success and failure', async () => {
  setupDom('<p></p>');
  assert.equal(await copyText('hello'), true);
  assert.deepEqual(clipboard, ['hello']);
  clipboardFails = true;
  assert.equal(await copyText('nope'), false);
});
