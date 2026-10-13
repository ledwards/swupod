import test from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import ptpCssScope, {PTP_SCOPE, scopeSelectorList} from './ptp-css-scope.mjs';

test('bare element rules only reach inside the bundle', () => {
 assert.equal(scopeSelectorList('button'), `${PTP_SCOPE} button`);
 assert.equal(scopeSelectorList('h1,h2,p'), `${PTP_SCOPE} h1,${PTP_SCOPE} h2,${PTP_SCOPE} p`);
 assert.equal(scopeSelectorList('button:focus-visible,a:focus-visible'), `${PTP_SCOPE} button:focus-visible,${PTP_SCOPE} a:focus-visible`);
 assert.equal(scopeSelectorList(':is(.a>button,.b button)'), `${PTP_SCOPE} :is(.a>button,.b button)`);
});

test('root-level rules also match the root itself', () => {
 assert.equal(scopeSelectorList('*'), `${PTP_SCOPE} *,*${PTP_SCOPE}`);
 assert.equal(scopeSelectorList('.app::before'), `${PTP_SCOPE} .app::before,.app${PTP_SCOPE}::before`);
 assert.equal(scopeSelectorList(':root'), PTP_SCOPE);
});

test('rules already led by a bundle root, html/body rules and keyframes are left alone', () => {
 assert.equal(scopeSelectorList('.app.table-themed.lobby-app button'), '.app.table-themed.lobby-app button');
 assert.equal(scopeSelectorList('body:has(.game-app) .turn-actions'), 'body:has(.game-app) .turn-actions');
 const css = postcss([ptpCssScope()]).process('@keyframes spin{from{opacity:0}to{opacity:1}}@media(max-width:600px){main{padding:0}}', {from: undefined}).css;
 assert.match(css, /from\{opacity:0\}to\{opacity:1\}/);
 assert.ok(css.includes(`${PTP_SCOPE} main{padding:0}`));
});
