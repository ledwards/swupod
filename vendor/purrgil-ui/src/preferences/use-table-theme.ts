import {useCustomizationAccess} from './access';
import {defaultThemeId, isFreeTheme} from './theme-contract';
import {useEffect, useState} from 'react';
import {loadTableThemes} from './theme-catalog';
import {themeById, type ThemeConfig} from './theme-contract';

export function useTableTheme(themeId: string) {
  const allowed=useCustomizationAccess();
  const [themes, setThemes] = useState<ThemeConfig[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    loadTableThemes()
      .then(list => { if (active) setThemes(list); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Table themes are unavailable'); });
    return () => { active = false; };
  }, []);
  return {themes, theme: themes.length ? themeById(themes, allowed||isFreeTheme(themeId)?themeId:defaultThemeId) : undefined, error};
}
