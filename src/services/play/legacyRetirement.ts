/** Host-side retirement; old clients receive an explicit migration destination. */
export const LEGACY_PLAY_RETIRED = 'External limited matchmaking has retired. Play directly on PTP at /play.'
export function legacyPlayRetired(): Response {
  return Response.json({success:false,data:null,error:LEGACY_PLAY_RETIRED,message:LEGACY_PLAY_RETIRED,code:'legacy_play_retired',playUrl:'/play'},{status:410,headers:{'cache-control':'no-store'}})
}

