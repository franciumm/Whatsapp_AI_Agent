import { generateSmartResponse } from './ai.js';
import { saveMessage, getHistory, checkUser, handleLongTermMemory } from './memory.js';
import redisClient from '../config/redis.js';

const processingUsers = new Set();

export async function handleIncomingMessage(client, msg) {
    if (msg.isStatus || msg.fromMe) return;

    const isVoice = msg.hasMedia && (msg.type === 'ptt' || msg.type === 'audio');
    if (!msg.body && !isVoice) return;

    const contact = await msg.getContact();
    const userId = contact.number;
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    if (processingUsers.has(userId)) return;
    processingUsers.add(userId);

    // --- REDIS RATE LIMITING ---
    try {
        const rateLimitKey = `rate_limit:${userId}`;
        const currentCount = await redisClient.incr(rateLimitKey);
        if (currentCount === 1) {
            await redisClient.expire(rateLimitKey, 60); // 1 minute window
        }
        if (currentCount > 15) { // Max 15 messages per minute
            console.log(`🚫 Rate limited user: ${userId}`);
            processingUsers.delete(userId);
            return;
        }
    } catch (err) {
        console.error("Redis rate limit error:", err);
    }

    try {
        const user = await checkUser(contact);
        
        if (user.status === 'human' || user.status === 'pending_human') {
            console.log(`⏸️ Bot paused for ${userId}. User is speaking with a human.`);
            processingUsers.delete(userId);
            await chat.clearState();
            return;
        }

        const history = await getHistory(userId);

        let mediaData = null;
        if (isVoice) {
            // downloadMedia() from Message Class docs
            const media = await msg.downloadMedia();
            if (media) mediaData = { data: media.data, mimeType: media.mimetype };
        }

        const userText = msg.body || "Analyze this audio.";
        const userProfile = {
            name: user.name,
            summary: user.summary,
            language: user.language,
            preferences: user.preferences,
            accountReferences: user.accountReferences
        };
        const { text, bookingData, handoffRequested, handoffReason } = await generateSmartResponse(history, userText, userProfile, mediaData);

        /**
         * ✅ ELITE CHANGE:
         * We do NOT use msg.reply(). We use client.sendMessage()
         * as seen in the Client Class documentation. 
         * This avoids the 'markedUnread' property lookup entirely.
         */
        await sleep(randomInt(2000,4000)); 

        await client.sendMessage(msg.from, text);
        await chat.clearState();

        await saveMessage(userId, isVoice ? 'user_voice' : 'user', userText);
        await saveMessage(userId, 'model', text);

        if (bookingData?.status === "success") {
            const adminId = client.info.wid._serialized;
            await client.sendMessage(adminId, `🚨 Booking Confirmed: ${bookingData.data.responses.name}`);
        }

        if (handoffRequested) {
            user.status = 'pending_human';
            user.escalationReason = handoffReason;
            await user.save();
            const adminId = client.info.wid._serialized;
            await client.sendMessage(adminId, `🚨 HUMAN HANDOFF REQUESTED\nUser: ${user.phone}\nReason: ${handoffReason}`);
        } else {
            handleLongTermMemory(user);
        }

    } catch (error) {
        console.error("Logic Protection Error:", error.message);
        await chat.clearState(); 

    } finally {
        processingUsers.delete(userId);
    }
}


function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
