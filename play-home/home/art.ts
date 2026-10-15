// Hyperspace art chosen for what each surface means. Card art windows differ by
// card type, so each entry carries the crop that hides the card frame.
// The CDN only serves these paths with the double slash PTP's card data uses.
const cdn='https://cdn.starwarsunlimited.com//';
export type Art={src:string;position:string;scale?:number};
export const art={
 // Utilities
 myDecks:{src:cdn+'card_SWH_01_476_Smuggling_Compartment_HYP_f93727bfc8.png',position:'50% 24%',scale:1.6},
 history:{src:cdn+'card_06020336_EN_Scour_the_Archives_b53f542d22.png',position:'50% 80%',scale:1.6},
 stats:{src:cdn+'card_0302441_EN_Strategic_Analysis_bf634a27ca.png',position:'50% 80%',scale:1.6},
 moreFormats:{src:cdn+'card_0202428_EN_The_Chaos_of_War_248678061a.png',position:'50% 80%',scale:1.6},
 // Meta: the top Premier leader by play rate since the Cad Bane suspension (swuapi decklists, Director Krennic 12.6%).
 meta:{src:cdn+'card_07020272_EN_Director_Krennic_Leader_Unit_43e0b73ac0.png',position:'50% 30%',scale:1.5},
 // Opponents
 queue:{src:cdn+'card_04020292_EN_Mos_Eisley_Base_3f8274a996.png',position:'50% 60%',scale:1.25},
 // Private game: the same busy Mos Eisley streets, cropped past the card frame.
 private:{src:cdn+'card_08020404_EN_Stronger_Together_6cce128bf7.png',position:'50% 72%',scale:1.6},
 ai:{src:cdn+'card_0302449_EN_Tactical_Droid_Commander_1811cfbfa5.png',position:'50% 26%',scale:1.6},
} satisfies Record<string,Art>;
/** Standard HMW printings: top common/uncommon picks in PTP's draft data. */
/** Each card's official image, then the same printing from Karabast's card store, so one CDN failing never empties the fan. */
export const draftFan=([['card_09010142_EN_Wookiee_Rangers_b66c1d7456.png','142'],['card_09010261_EN_Ben_Kenobi_6125e049a2.png','261'],['card_09010089_EN_Territorial_Mudhorn_b49d3903d4.png','089']] as const)
 .map(([file,num])=>[cdn+file,`https://karabast-data.s3.amazonaws.com/cards/HMW/en/standard/large/${num}.webp`]);
export const premierLeaders=[cdn+'card_09020276_EN_Grand_Moff_Tarkin_Leader_3dac48bc25.png',cdn+'card_09020281_EN_Chewbacca_Leader_2bdbba94d1.png'];
export const eternalLeaders=[cdn+'card_SWH_01_283_Hansolo_Leader_HYP_a1f959baa9.png',cdn+'card_SWH_01_282_Grand_Admiral_Thrawn_Leader_HYP_710ec70881.png'];
/** Eternal tab: no Eternal play-rate data offline (swuapi meta needs auth), so the first of eternalLeaders: Han Solo, Hyperspace. */
export const eternalLeader='SOR-017';
/** Leader unit side, 286x400 portrait; its art window sits about 18-60% down the card. */
export const leaderArt=(id:string)=>{const [set,num]=id.replace('_','-').toUpperCase().split('-');return `https://karabast-data.s3.amazonaws.com/cards/${encodeURIComponent(set)}/en/standard/large/${num.padStart(3,'0')}.webp`;};
export const setArt=(ptp:string,code:string)=>`${ptp}/expansion-art/${code.toLowerCase()}.${['sor','shd','jtl'].includes(code.toLowerCase())?'jpg':'png'}`;
/** PTP's 480px WebP copy of a set's expansion art (scripts/build-set-thumbs.mjs): about 30 KB against the PNG's 1 MB, for tiles. */
export const setThumb=(ptp:string,code:string)=>`${ptp}/expansion-art/home/${code.toLowerCase()}.webp`;
export const packArt=(ptp:string,code:string,n:number)=>`${ptp}/pack-images/${code.toLowerCase()}-pack-${n}.png`;
/** The newest set whose booster art PTP ships (public/pack-images/<set>-pack-1..3.png). The homepage fan shows it
 * whenever no set list is known: in the prerendered shell (no document, so no data-play-sets) and before the lobby state. */
export const newestPackSet='HMW';
/** PTP's 400px WebP copy of a pack (scripts/build-pack-thumbs.mjs): about 17 KB against the PNG's 1.4 MB, so the fan paints on a slow phone. */
export const packThumb=(ptp:string,code:string,n:number)=>`${ptp}/pack-images/home/${code.toLowerCase()}-pack-${n}.webp`;
/** Every image the fan may show for one pack, best first: this set's small copies (art n first), its full PNGs, then the
 * newest set's, then production's copy. A set without pack art yet, or a failed load, falls through; the fan never ends empty. */
export const packCandidates=(ptp:string,code:string,n:number)=>{
 const order=(c:string)=>{const ns=[n,...[1,2,3].filter(m=>m!==n)];return [...ns.map(m=>packThumb(ptp,c,m)),...ns.map(m=>packArt(ptp,c,m))];};
 return [...new Set([...order(code),...order(newestPackSet),packArt('https://www.protectthepod.com',newestPackSet,n)])];
};

/** Table scenery follows the active set; new sets use their own expansion art until curated. */
export const sealedTableBySet:Record<string,string>={SOR:'massassi',SHD:'mandalore',TWI:'republic-senate',JTL:'hyperspace',LOF:'jedi-temple',SEC:'isb',LAW:'jabbas-palace',ASH:'vaders-castle',HMW:'kashyyyk'};
