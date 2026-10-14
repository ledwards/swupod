export type PlayMode='queue'|'private'|'ai';
export type Breakdown={matchIds?:string[];format?:string;key:string;leader:string;base:string;colors:string[];games:number;wins:number;losses:number;draws:number};
export type RatingRecord={elo:number;games:number;wins:number;losses:number;draws:number};
export type PlayerStats={all:RatingRecord;season:RatingRecord;formats:Record<"all"|"season",Record<string,Omit<RatingRecord,"elo">>>;breakdowns?:Record<"all"|"season",Record<"decks"|"archetypes"|"opponents",Breakdown[]>>;sportsmanship?:{commendations:number;games:number;recent:{id:string;opponent:string;commended:boolean}[]};lastResetAt:number|null};
export type GlobalMatchup={key:string;wins:number;losses:number;draws:number};
export type LobbyGame = {turns?:number|null;globalMatchup?:GlobalMatchup|null;id:string;players:string[];leaders?:string[];bases?:string[];format:string;createdAt:number;url?:string;replayUrl?:string;recordingUrl?:string;result?:string;status:string;seat?:number;mode?:PlayMode;completedAt?:number|null;poolShareId?:string|null;contract?:{format:'premier'|'eternal'|'limited';limited:'draft'|'six'|'eight'|'chaos';pool:'current'|'next';set:string}};
export type LobbyState = {
 enabled:boolean;
 alpha?:boolean;
 activity:{activeGames:number;queuedPlayers:number};
 user:null|{name:string;avatarUrl?:string|null;lifetimeElo:number|null;seasonElo:number|null;season:string;stats?:PlayerStats};
 capabilities:{queue:boolean;private:boolean;ai:boolean};
 loginUrl:string;ptpUrl:string;legacyGame:boolean;
 active:LobbyGame|null;queue:null|{joinedAt:number;format?:string};games:LobbyGame[];history:LobbyGame[];
};
export async function lobbyRequest<T>(path='',body?:unknown,signal?:AbortSignal):Promise<T>{
 const timeout=AbortSignal.timeout(path==='/melee'?50000:/^\/matches\/[^/]+\/cards\//.test(path)?35000:15000);
 const response=await fetch(`/api/lobby${path}`,{credentials:'same-origin',signal:signal?AbortSignal.any([signal,timeout]):timeout,...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 const value=await response.json();
 if(!response.ok)throw Error(value.error?.message??'Unable to reach the lobby. Please try again.');
 return value as T;
}
