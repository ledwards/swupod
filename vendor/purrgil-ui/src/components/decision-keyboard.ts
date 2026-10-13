import {flushSync} from 'react-dom';

const choices='.card.legal,.card.selected,.prompt-buttons>button:not([data-confirm-action]),[data-turn-action],.number-choices>button';
const usable=(el:HTMLElement)=>!el.matches(':disabled')&&!!el.getClientRects().length&&!el.closest('[inert]');
export function decisionKeyboard(panel:HTMLElement,event:KeyboardEvent){
 if(!['Enter',' '].includes(event.key)||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return false;
 const focused=document.activeElement instanceof HTMLElement&&panel.contains(document.activeElement)?document.activeElement:null;
 if(focused?.matches('textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="number"]),select,[contenteditable]'))return false;
 const finish=panel.querySelector<HTMLElement>('.turn-actions[data-finish-only]');
 // A focused turn action keeps the usual pick-then-confirm keys.
 if(finish&&usable(finish)&&!focused?.matches('[data-turn-action]')){
  const action=event.key===' '?'pass':'claimInitiative';
  const button=finish.querySelector<HTMLButtonElement>(`[data-turn-action="${action}"]`);
  event.preventDefault();event.stopImmediatePropagation();
  if(button&&usable(button))button.click();
  return true;
 }
 const primary=panel.querySelector<HTMLButtonElement>('[data-confirm-action],[data-default-action]');
 const items=[...panel.querySelectorAll<HTMLElement>(choices)].filter(usable);
 const highlighted=focused?.matches(choices)&&usable(focused)?focused:null;
 const picked=items.find(el=>el.hasAttribute('data-keyboard-picked'));
 const targets=items.filter(el=>el.matches('.card.legal,.card.selected'));
 const soleTarget=(panel.querySelector('.attack-targeting')||panel.matches('.decision-cards'))&&targets.length===1?targets[0]:null;
 const item=highlighted??picked??soleTarget??(items.length===1?items[0]:null);
 const spaceAction=items.find(el=>el.matches('.prompt-buttons>[data-space-action]'));
 const defaultChoice=items.find(el=>el.matches('.prompt-buttons>button:not([data-space-action])')&&!/^(cancel|back)$/i.test(el.textContent?.trim()??''));
 const setting=focused?.matches('[aria-pressed],input[type="checkbox"],input[type="radio"]')&&!focused.matches(choices)?focused:null;
 const close=panel.querySelector<HTMLButtonElement>('.modal-close,.themes-close,.decision-close');
 event.preventDefault();event.stopImmediatePropagation();
 if(event.key===' '){
  if(setting){setting.click();return true;}
  if(focused?.matches('[data-confirm-action],[data-default-action],.decision-tools button'))return true;
  const skip=item?.hasAttribute('data-space-action')?item:!item?spaceAction:null;
  if(skip){skip.click();return true;}
  if(!item)return true;
  if(item.hasAttribute('data-selection-action'))item.click();
  else{const selected=item.hasAttribute('data-keyboard-picked');items.forEach(el=>el.removeAttribute('data-keyboard-picked'));if(!selected)item.setAttribute('data-keyboard-picked','true');}
  return true;
 }
 if(primary){
  if(setting&&!setting.matches('[aria-pressed="true"],:checked'))flushSync(()=>setting.click());
  // Flush only the local pick, then submit this same decision's button. Never
  // follow a replacement dialog into another decision from a single keypress.
  if(highlighted?.hasAttribute('data-selection-action')&&!highlighted.matches('.selected,[aria-pressed="true"]'))flushSync(()=>highlighted.click());
  if(primary.isConnected&&usable(primary))primary.click();
 }else if(item?.hasAttribute('data-space-action')){
  // Passing and skipping are Space actions, even when they are the only choice.
 }else if(item){
  if(spaceAction&&item.hasAttribute('data-selection-action')){
   if(!item.matches('.selected,[aria-pressed="true"]'))flushSync(()=>item.click());
   const confirm=panel.querySelector<HTMLButtonElement>('[data-confirm-action]');
   if(confirm?.isConnected&&usable(confirm))confirm.click();
   return true;
  }
  if(!item.matches('.selected,[aria-pressed="true"]')||!item.hasAttribute('data-selection-action'))item.click();
 }else if(defaultChoice){defaultChoice.click();
 }else{
  if(setting&&!setting.matches('[aria-pressed="true"],:checked'))flushSync(()=>setting.click());
  if(!spaceAction&&close&&usable(close))close.click();
 }
 return true;
}
