import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, normalizeUrl, domainOf, chooseImageUrl, largestSrcsetCandidate } from '../../shared/url.js';

test('kindOf', () => {
  assert.equal(kindOf('https://a.com/x.png'), 'http');
  assert.equal(kindOf('data:image/png;base64,AAA'), 'data');
  assert.equal(kindOf('blob:https://a.com/123'), 'blob');
});

test('normalizeUrl strips fragment, keeps query', () => {
  assert.equal(normalizeUrl('https://A.com/x.png?w=200#frag'), 'https://a.com/x.png?w=200');
  assert.equal(normalizeUrl('not a url'), 'not a url');
});

test('domainOf drops www', () => {
  assert.equal(domainOf('https://www.example.com/a'), 'example.com');
  assert.equal(domainOf('garbage'), '');
});

test('chooseImageUrl prefers currentSrc, then lazy source over placeholders', () => {
  const src = 'https://a.com/small.jpg';
  assert.equal(chooseImageUrl(src, null), src);
  assert.equal(chooseImageUrl(src, { currentSrc: 'https://a.com/large.jpg', naturalWidth: 800 }), 'https://a.com/large.jpg');
  assert.equal(
    chooseImageUrl('data:image/gif;base64,R0', { currentSrc: 'data:image/gif;base64,R0', naturalWidth: 1, lazySrc: 'https://a.com/real.jpg' }),
    'https://a.com/real.jpg',
  );
  assert.equal(chooseImageUrl(src, { currentSrc: src, naturalWidth: 800, lazySrc: 'https://a.com/other.jpg' }), src);
});

test('largestSrcsetCandidate', () => {
  assert.equal(largestSrcsetCandidate('a.jpg 320w, b.jpg 1280w, c.jpg 640w', 'https://x.com/p/'), 'https://x.com/p/b.jpg');
  assert.equal(largestSrcsetCandidate('a.jpg, b.jpg 2x', 'https://x.com/'), 'https://x.com/b.jpg');
  assert.equal(largestSrcsetCandidate('', 'https://x.com/'), null);
});
