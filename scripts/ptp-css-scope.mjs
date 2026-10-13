/**
 * PostCSS plugin for the PTP bundle (vite.ptp.config.ts).
 *
 * Purrgil's stylesheets are written for a page Purrgil owns: bare element rules
 * (`button{min-height:42px}`, `*{box-sizing:border-box}`, `main{display:grid}`, `h1,h2,p{margin:0}`),
 * `:root` fonts and generic class names (`.app`, `.card`). On PTP the same sheet is linked on every
 * route, so those rules restyled PTP's own pages (the deck builder's buttons grew to 42px).
 *
 * This confines every rule to the bundle's own subtrees: the `.lobby-app` roots that `mount`,
 * `mountWebsiteControls` and `mountLiveStrip` render, plus the two nodes the bundle portals outside them.
 * The scope is wrapped in `:where()`, so specificity and therefore the cascade inside the bundle is unchanged.
 * `html`/`body` rules stay global: they are page-level by intent and guarded by `:has(.game-app)`.
 */
export const PTP_SCOPE = ':where(.lobby-app,.site-release-notes,.ph-metric-tooltip)';
/** Classes only the bundle uses: a rule led by one is already confined to the bundle's roots. */
const BUNDLE_ROOT = /\.(?:lobby-app|table-themed)(?![\w-])/;
/** Classes that sit on a scope root itself, so a rule led by them must also match the root, not only inside it. */
const ROOT_CLASS = /\.(?:lobby-app|app|table-themed|ph-shell|ph-live-host|website-controls|site-release-notes|ph-metric-tooltip)(?![\w-])/;

/** Split on commas outside (), [] and strings. */
function splitTop(list, sep) {
 const out = []; let depth = 0, quote = '', start = 0;
 for (let i = 0; i < list.length; i++) {
  const c = list[i];
  if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
  if (c === '"' || c === "'") quote = c;
  else if (c === '(' || c === '[') depth++;
  else if (c === ')' || c === ']') depth--;
  else if (depth === 0 && sep(c)) { out.push(list.slice(start, i)); start = i + 1; }
 }
 out.push(list.slice(start));
 return out;
}

/** Index where the first compound selector ends (first top-level combinator or whitespace). */
function firstCompoundEnd(sel) {
 let depth = 0, quote = '';
 for (let i = 0; i < sel.length; i++) {
  const c = sel[i];
  if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
  if (c === '"' || c === "'") quote = c;
  else if (c === '(' || c === '[') depth++;
  else if (c === ')' || c === ']') depth--;
  else if (depth === 0 && /[\s>+~]/.test(c)) return i;
 }
 return sel.length;
}

/** The selector restricted to the bundle's subtrees. Returns a selector list string. */
export function scopeSelector(selector) {
 const sel = selector.trim();
 if (!sel) return sel;
 if (sel === ':root') return PTP_SCOPE;
 if (/^(?:html|body)(?![\w-])/.test(sel)) return sel;
 const end = firstCompoundEnd(sel);
 const first = sel.slice(0, end), rest = sel.slice(end);
 if (BUNDLE_ROOT.test(first)) return sel;
 const out = [`${PTP_SCOPE} ${sel}`];
 if (first === '*' || ROOT_CLASS.test(first)) {
  // Insert before any pseudo-element so `.app::before` becomes `.app:where(…)::before`.
  const pseudo = first.indexOf('::');
  const self = pseudo < 0 ? first + PTP_SCOPE : first.slice(0, pseudo) + PTP_SCOPE + first.slice(pseudo);
  out.push(self + rest);
 }
 return out.join(',');
}

export function scopeSelectorList(list) {
 return splitTop(list, c => c === ',').map(scopeSelector).filter(Boolean).join(',');
}

/** @returns {import('postcss').Plugin} */
export default function ptpCssScope() {
 return {
  postcssPlugin: 'ptp-css-scope',
  Rule(rule) {
   if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
   if (rule.__ptpScoped) return;
   rule.selector = scopeSelectorList(rule.selector);
   rule.__ptpScoped = true;
  },
 };
}
ptpCssScope.postcss = true;
