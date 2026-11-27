#!/usr/bin/env node
'use strict';

/**
 * Every page ships the same strict Content-Security-Policy (meta tag; GitHub
 * Pages cannot set response headers), so page HTML must not contain anything
 * that policy would block:
 *   - inline <script> bodies, inline <style> blocks, style="" attributes
 *   - on*="" event-handler attributes, javascript: URLs
 *   - third-party scripts, stylesheets, or fonts
 * Put page logic in js/<page>.js and page styles in css/<page>.css.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const EXPECTED_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  'upgrade-insecure-requests'
].join('; ');

const pages = fs.readdirSync(root).filter(name => name.endsWith('.html')).sort();
const problems = [];

function check(page, condition, message) {
  if (!condition) problems.push(page + ': ' + message);
}

pages.forEach(page => {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const head = (html.match(/<head>([\s\S]*?)<\/head>/) || [])[1] || '';

  const csp = head.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  check(page, csp, 'missing Content-Security-Policy meta tag');
  if (csp) check(page, csp[1] === EXPECTED_CSP, 'CSP differs from the shared policy');
  const cspAt = head.indexOf('Content-Security-Policy');
  const firstResource = head.search(/<(link|script)\b/);
  check(page, cspAt >= 0 && (firstResource < 0 || cspAt < firstResource), 'CSP meta must come before any <link> or <script>');

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    check(page, /\bsrc="/.test(m[1]), 'inline <script> body (move it to js/)');
    check(page, !m[2].trim(), '<script src> element must be empty');
    const src = (m[1].match(/\bsrc="([^"]*)"/) || [])[1] || '';
    check(page, !/^(https?:)?\/\//.test(src), 'third-party script ' + src);
  }
  check(page, !/<style\b/i.test(html), 'inline <style> block (move it to css/)');
  check(page, !/\sstyle\s*=\s*["']/i.test(html), 'style="" attribute (use a class)');
  check(page, !/<[a-z][^>]*\son[a-z]+\s*=/i.test(html), 'inline on*="" event handler');
  check(page, !/javascript:/i.test(html), 'javascript: URL');
  for (const m of html.matchAll(/<link\b[^>]*\bhref="([^"]*)"[^>]*>/g)) {
    if (/rel="(stylesheet|preload|preconnect)"/.test(m[0])) {
      check(page, !/^(https?:)?\/\//.test(m[1]), 'third-party stylesheet/font ' + m[1]);
    }
  }
});

if (problems.length) {
  console.error('CSP check failed:');
  problems.forEach(problem => console.error('- ' + problem));
  process.exit(1);
}

console.log('OK: CSP meta present and no inline script/style/handlers (' + pages.length + ' pages)');
