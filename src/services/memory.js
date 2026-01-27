import ChatLog from '../models/ChatLog.js';
import User from '../models/User.js';

/**
 * Adds a message to the database
 */
export async function saveMessage(userId, role, content) {
    try {
        await ChatLog.create({
            phone: userId,
            role: role, // 'user' or 'model'
            message: content
        });
          if (role === 'user') {
        await User.findOneAndUpdate({ phone: userId }, { $inc: { messageCountSinceLastSummary: 1 } });
    }
    } catch (error) {
        console.error("❌ Failed to save memory:", error.message);
    }
}

/**
 * Retrieves the last 10 messages for context
 */
export async function getHistory(userId) {
    try {
        // Fetch last 10 messages, sorted by time
        const history = await ChatLog.find({ phone: userId })
            .sort({ timestamp: -1 })
            .limit(10);
        
        // MongoDB returns them Newest->Oldest. We need Oldest->Newest for conversation flow.
        return history.reverse().map(msg => ({
            role: msg.role,
            parts: [{ text: msg.message }] // Gemini format
        }));
    } catch (error) {
        console.error("❌ Failed to fetch history:", error.message);
        return [];
    }
}

/**
 * Ensure user exists in DB
 */
export async function checkUser(contact) {
    try {
        let user = await User.findOne({ phone: contact.number });
        if (!user) {
            user = await User.create({
                phone: contact.number,
                name: contact.pushname || "Unknown"
            });
            console.log(`👤 New User Registered: ${contact.pushname}`);
        }
        return user; // ✅ CRITICAL: Must return the user object
    } catch (error) {
        console.error("User check error:", error.message);
        return null;
    }
}
export async function handleLongTermMemory(user) {
    if (user.messageCountSinceLastSummary >= 15) {
        console.log(`🧹 Summarizing memory for ${user.name}...`);
        const history = await getHistory(user.phone);
        const newSummary = await summarizeHistory(history);
        
        if (newSummary) {
            user.summary = newSummary;
            user.messageCountSinceLastSummary = 0;
            await user.save();
            
            // Optional: Delete logs older than the last 15 to keep DB clean
            // await ChatLog.deleteMany({ phone: user.phone, timestamp: { $lt: someDate } });
        }
    }
}