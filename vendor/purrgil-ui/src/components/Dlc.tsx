import {ContentSkeleton} from './ContentSkeleton';
import {CosmeticLock} from './CosmeticLock';
import {OfficialTokenCatalog} from './OfficialTokens';
import {InitiativeCatalog} from './InitiativeCatalog';
import {InUseCheck} from './InUseCheck';
import {EventCosmetics,EventCosmeticFeedback,useEventCosmetics} from './EventCosmetics';
import {artworkUrl, artworkThumbnailUrl} from '../artwork';
import {PlaymatCatalog} from './PlaymatCatalog';
import {Sleeves} from './Sleeves';
import {TokenCards} from './TokenCards';
import {useCustomizationAccess,useSignedIn,loginUrl,membershipUrl,catalogExploreOpen} from '../preferences/access';
import {TokenArt} from './TokenArt';
import {useState, useSyncExternalStore, type CSSProperties} from 'react';
import {useTablePreferences, writePreferences} from '../preferences/table';
import {themeProperties, isFreeTheme, type ThemeConfig} from '../preferences/theme-contract';
import {useTableTheme} from '../preferences/use-table-theme';
import {subscribeTokenSet, readTokenSet, tokenSetById, tokenSets, writeTokenSet, type TokenSetId} from '../preferences/token-sets';

const swatches = ['surface', 'surfaceRaised', 'text', 'textMuted', 'accent', 'highlight', 'success', 'warning', 'danger'] as const;

function previewStyle(theme: ThemeConfig): CSSProperties {
  const framing = themeProperties(theme);
  return {
    '--table-scale-x': framing['--table-scale-x'],
    '--table-scale-y': framing['--table-scale-y'],
    '--table-origin-x': framing['--table-origin-x'],
    '--table-origin-y': framing['--table-origin-y'],
  } as CSSProperties;
}

export default function Dlc({onClose}:{onClose?:()=>void}={}) {
 const collection=useEventCosmetics();
  const allowed=useCustomizationAccess();
  const signedIn=useSignedIn();
  const loggedOut=signedIn===false&&!catalogExploreOpen;
  const [section, setSection] = useState<'themes' | 'tokens' | 'token-cards' | 'sleeves' | 'playmats' | 'events'>(()=>new URLSearchParams(location.search).get('section')==='playmats'?'playmats':'themes');
  const [preferences, setPreferences] = useTablePreferences();
  const tokenSet = useSyncExternalStore(subscribeTokenSet,readTokenSet);
  const [tokenFocus, setTokenFocus] = useState(tokenSet);
  const {themes, error} = useTableTheme(preferences.theme);
  const [focusId, setFocusId] = useState(preferences.theme);
  const focus = themes.find(theme => theme.id === focusId) ?? themes.find(theme => theme.id === preferences.theme) ?? themes[0];
  const activeSet = tokenSetById(tokenFocus);

  const themeUsable = allowed || isFreeTheme(focus?.id);
  const tokenLabel = loggedOut ? 'Log in to use this set' : !allowed ? 'Locked · Friend of the Pod' : tokenSet === activeSet.id ? 'In use on your table' : 'Use this set';

  return <div className="dlc-page">
    <header className="dlc-bar">
      <span className="brand">Themes</span>
      <nav aria-label="Theme catalogs">
        <button type="button" aria-pressed={section === 'themes'} onClick={() => setSection('themes')}>Themes</button>
        <button type="button" aria-pressed={section === 'tokens'} onClick={() => setSection('tokens')}>Token sets</button>
        <button type="button" aria-pressed={section === 'token-cards'} onClick={() => setSection('token-cards')}>Token cards</button>
      <button type="button" aria-pressed={section==='sleeves'} onClick={()=>setSection('sleeves')}>Card backs</button>
        <button type="button" aria-pressed={section==='playmats'} onClick={()=>setSection('playmats')}>Playmats</button>
        <button type="button" aria-pressed={section==='events'} onClick={()=>setSection('events')}>Events</button>
      </nav>
      {loggedOut&&<a className="btn btn--discord btn--sm dlc-login" href={loginUrl}>Log in with Discord</a>}
      {onClose&&<button type="button" className="btn btn--icon themes-close" aria-label="Close themes" title="Close themes" onClick={onClose}>×</button>}
    </header>
    {loggedOut&&<section className="customization-lock"><strong>Log in to customize your table</strong><p>Themes, playmats, and token sets stay locked until you sign in with Discord.</p><a className="btn btn--discord" href={loginUrl}>Log in with Discord</a></section>}
    {signedIn===true&&!allowed&&section==='themes'&&<section className="customization-lock"><strong>Table customization</strong><p>Become a Friend of the Pod to unlock table themes, Gamegenic playmats, and token sets. Event mats unlock through Melee participation or qualifying results. Star Wars Unlimited and Purrgil Passage are free for everyone.</p><a href={membershipUrl} target="_blank" rel="noopener noreferrer">Become a Friend of the Pod</a></section>}
    <EventCosmeticFeedback collection={collection}/>
    {section==='events'?<EventCosmetics collection={collection}/>:section === 'playmats' ? <PlaymatCatalog allowed={allowed} collection={collection}/> : section === 'themes' ? <main className="dlc-catalog theme-catalog">
      <div className="dlc-list">
        {error && <p role="alert">{error}</p>}
        {!themes.length && !error && <ContentSkeleton/>}
        {themes.map(theme => {const locked=!allowed&&!isFreeTheme(theme.id), inUse=preferences.theme === theme.id;
          return <div key={theme.id} className="theme-choice">
            <button type="button" disabled={loggedOut} className={locked?'cosmetic-locked':undefined} aria-describedby={locked?`theme-lock-${theme.id}`:undefined} aria-pressed={focus?.id === theme.id} onClick={() => setFocusId(theme.id)}>
              <span className="theme-preview table-environment-preview" style={previewStyle(theme)}><img src={artworkThumbnailUrl(theme.background.image)} alt="" loading="lazy"/></span>
              {locked&&<CosmeticLock id={`theme-lock-${theme.id}`} reason="Requires Friend of the Pod customization access."/>}<span>{theme.name}</span>
            </button>
            {inUse ? <InUseCheck/> : focus?.id === theme.id && !locked && !loggedOut && <button type="button" className="btn dlc-table-apply" onClick={event => { const tile = event.currentTarget.parentElement?.querySelector('button'); setPreferences(writePreferences({...preferences, theme: theme.id})); tile?.focus(); }}>Use this Theme</button>}
          </div>;})}
      </div>
      {focus && <article className="dlc-detail" style={themeProperties(focus) as CSSProperties}>
        <div className={`table-environment-preview dlc-stage ${!themeUsable?'cosmetic-locked':''}`} tabIndex={!themeUsable?0:undefined} aria-describedby={!themeUsable?'theme-preview-lock':undefined} style={previewStyle(focus)}><img src={artworkUrl(focus.background.image)} alt=""/>{!themeUsable&&<CosmeticLock id="theme-preview-lock" reason="Become a Friend of the Pod to use this table theme." requirement="Friend of the Pod"/>}</div>
        <div className="dlc-sample">
          <h1>{focus.name}</h1>
          <p className="dlc-highlight">Appearance preview</p>
          <p>Controls and text in {focus.name}.</p>
          <div className="dlc-actions" aria-label="Button style samples"><span className="theme-button-sample primary">Primary style</span><span className="theme-button-sample">Secondary style</span></div>
          <div className="dlc-status"><span>Ready</span><span>Waiting</span><span>Disconnected</span></div>
          <div className="dlc-swatches" aria-label="Palette">{swatches.map(role => <span key={role} title={`${role} ${focus.colors[role]}`} style={{background: focus.colors[role]}}/>)}</div>
          </div>
      </article>}
    </main> : section==='sleeves'?<Sleeves disabled={loggedOut||!allowed} collection={collection}/>:section==='token-cards'?<TokenCards disabled={loggedOut||!allowed}/>: <main className="dlc-token-catalog"><section className="dlc-catalog dlc-tokens" aria-label="Token sets">
      <div className="dlc-list">
        {tokenSets.map(set => <button key={set.id} type="button" disabled={loggedOut} className={!allowed?'cosmetic-locked':undefined} aria-describedby={!allowed?`token-lock-${set.id}`:undefined} aria-pressed={activeSet.id === set.id} onClick={() => setTokenFocus(set.id)}>
          <span className="dlc-set-preview">{['initiative','damage','shield'].flatMap(role => {const piece=set.pieces.find(item=>item.role===role);return piece?[<TokenArt key={role} piece={piece}/>]:[];})}</span>
          {!allowed&&<CosmeticLock id={`token-lock-${set.id}`} reason="Requires Friend of the Pod customization access."/>}<span>{set.name}</span>
          {tokenSet === set.id && <InUseCheck/>}
        </button>)}
      </div>
      <article className="dlc-detail dlc-token-detail">
        <header className="dlc-token-head">
          <h1>{activeSet.name}</h1>
          {allowed&&<button type="button" title={tokenLabel} className="btn btn--primary" disabled={loggedOut||!allowed||tokenSet === activeSet.id} onClick={() => { writeTokenSet(activeSet.id as TokenSetId); }}>{tokenSet === activeSet.id ? <InUseCheck/> : <>{tokenLabel}</>}</button>}
        </header>
        <ul>{activeSet.pieces.map(piece => <li key={`${piece.src}:${piece.name}`}><span className="dlc-piece"><TokenArt piece={piece}/></span><strong>{piece.name}</strong>{piece.printing&&<small>Card · {piece.printing}</small>}</li>)}</ul>
      </article>
    </section><InitiativeCatalog disabled={loggedOut||!allowed} collection={collection}/><OfficialTokenCatalog role="force" disabled={loggedOut||!allowed}/><OfficialTokenCatalog role="credit" disabled={loggedOut||!allowed}/></main>}
  </div>;
}
