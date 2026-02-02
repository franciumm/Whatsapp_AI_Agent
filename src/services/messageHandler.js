import { generateSmartResponse } from './ai.js';
import { saveMessage, getHistory, checkUser, handleLongTermMemory } from './memory.js';

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

    try {
        const user = await checkUser(contact);
        const history = await getHistory(userId);

        let mediaData = null;
        if (isVoice) {
            // downloadMedia() from Message Class docs
            const media = await msg.downloadMedia();
            if (media) mediaData = { data: media.data, mimeType: media.mimetype };
        }

        const userText = msg.body || "Analyze this audio.";
        const { text, bookingData } = await generateSmartResponse(history, userText, user.summary, mediaData);

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

        handleLongTermMemory(user);

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
