import {test} from 'node:test'
import assert from 'node:assert/strict'
import {feedbackMessage,FEEDBACK_CHANNEL_ID} from './gameFeedbackDiscord'
test('Discord feedback includes the comment and protected record link, with no mentions or snapshot',()=>{
 const note={id:'8bb271ae-b557-47b3-8486-e26ec035924d',note:'@everyone bad target',match_id:'game',step:7,snapshot:{hand:['private']},subject:'private-user'};
 const message=feedbackMessage(note);
 assert.equal(FEEDBACK_CHANNEL_ID,'1557629344975691858');
 assert.deepEqual(message.allowed_mentions,{parse:[]});
 assert.equal(message.embeds[0]!.description,note.note);
 assert.equal(message.embeds[0]!.url,'https://protectthepod.com/api/admin/game-notes?id='+note.id);
 assert.equal(JSON.stringify(message).includes('private'),false);
 assert.equal(message.nonce,feedbackMessage(note).nonce);
 assert.notEqual(message.nonce,feedbackMessage({...note,id:'other'}).nonce);
 assert.equal(message.enforce_nonce,true);
});
