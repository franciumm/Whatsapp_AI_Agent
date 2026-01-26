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
        const exists = await User.findOne({ phone: contact.number });
        if (!exists) {
            await User.create({
                phone: contact.number,
                name: contact.pushname || "Unknown"
            });
            console.log(`👤 New User Registered: ${contact.pushname}`);
        }
    } catch (error) {
        console.error("User check error:", error.message);
    }
}