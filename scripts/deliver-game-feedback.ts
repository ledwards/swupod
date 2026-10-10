import {deliverPendingGameFeedback} from '../lib/play/gameFeedbackDiscord'
import {closePool} from '../lib/db'
try{await deliverPendingGameFeedback()}finally{await closePool()}
