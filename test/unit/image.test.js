import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffMime, fitBudget } from '../../background/image.js';

const bytes = (...parts) => {
  const arr = [];
  for (const p of parts) {
    if (typeof p === 'string') for (const ch of p) arr.push(ch.charCodeAt(0));
    else arr.push(...p);
  }
  while (arr.length < 16) arr.push(0);
  return new Uint8Array(arr);
};

test('sniffMime recognizes common formats by magic bytes', () => {
  assert.equal(sniffMime(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(sniffMime(bytes([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffMime(bytes('GIF89a')), 'image/gif');
  assert.equal(sniffMime(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')), 'image/webp');
  assert.equal(sniffMime(bytes([0, 0, 0, 0x1c], 'ftypavif')), 'image/avif');
  assert.equal(sniffMime(bytes([0, 0, 0, 0x1c], 'ftypmif1', [0, 0, 0, 0], 'avifmiaf')), 'image/avif');
  assert.equal(sniffMime(bytes('BM')), 'image/bmp');
  assert.equal(sniffMime(bytes([0, 0, 1, 0])), 'image/x-icon');
});

test('sniffMime recognizes SVG text with prolog', () => {
  const svg = new TextEncoder().encode('﻿<?xml version="1.0"?>\n<!-- c -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.equal(sniffMime(svg), 'image/svg+xml');
});

test('sniffMime falls back to content type, ignores non-images', () => {
  const unknown = bytes('hello world!');
  assert.equal(sniffMime(unknown, 'image/x-foo; charset=x'), 'image/x-foo');
  assert.equal(sniffMime(unknown, 'text/html'), null);
});

test('fitBudget keeps small images and scales large ones', () => {
  assert.deepEqual(fitBudget(800, 600), { width: 800, height: 600, scaled: false });
  const big = fitBudget(10_000, 10_000);
  assert.equal(big.scaled, true);
  assert.ok(big.width * big.height <= 40_000_000);
  const wide = fitBudget(40_000, 100);
  assert.ok(wide.width <= 16_384);
});
