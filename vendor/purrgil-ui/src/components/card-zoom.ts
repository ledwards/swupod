export const dismissCardZoomsEvent='purrgil-dismiss-card-zooms';

export function dismissCardZooms(){
 window.dispatchEvent(new Event(dismissCardZoomsEvent));
}
