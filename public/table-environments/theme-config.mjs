/** Apply to the theme root; use opaque surfaces for all text-bearing UI. */
export function applyTheme(element, theme) {
  for (const [role, color] of Object.entries(theme.colors)) {
    element.style.setProperty('--theme-' + role.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), color);
  }
  const {background} = theme;
  if(background.framing.scaleX !== background.framing.scaleY)throw new Error('Theme artwork must use uniform scaling');
  element.style.setProperty('--table-art', `url("${background.image}")`);
  for (const axis of ['X', 'Y']) {
    element.style.setProperty('--table-scale-' + axis.toLowerCase(), background.framing['scale' + axis]);
    element.style.setProperty('--table-origin-' + axis.toLowerCase(), background.framing['origin' + axis] + '%');
  }
  // The mockups' original aliases, retained for incremental integration.
  for (const [alias, role] of Object.entries({ink:'text', muted:'textMuted', mint:'accent', gold:'highlight'})) {
    element.style.setProperty('--' + alias, theme.colors[role]);
  }
  element.dataset.theme = theme.id;
}
