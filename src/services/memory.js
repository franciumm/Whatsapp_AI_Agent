import ChatLog from '../models/ChatLog.js';
import User from '../models/User.js';
import { extractUserProfile } from './ai.js';
import redisClient from '../config/redis.js';

/**
 * ELITE SAVE: Ensures database integrity even if AI/Media fails
 */
export async function saveMessage(userId, role, content) {
    try {
        // Fallback: If content is empty/null, save a descriptive placeholder
        const safeContent = (content && content.trim().length > 0) 
            ? content 
            : `[No text content for ${role}]`;

        await ChatLog.create({
            phone: userId,
            role: role, 
            message: safeContent // This will now never be null/undefined
        });
        
        if (role === 'user' || role === 'user_voice') {
            await User.findOneAndUpdate({ phone: userId }, { $inc: { messageCountSinceLastSummary: 1 } });
        }
        
        // Invalidate history cache
        try {
            await redisClient.del(`history:${userId}`);
        } catch (e) {
            console.error("Redis cache invalidation error:", e);
        }
    } catch (error) {
        console.error("❌ Database Error:", error.message);
    }
}

/**
 * ELITE FETCH: Maps roles correctly for Gemini
 */
export async function getHistory(userId) {
    try {
        const cacheKey = `history:${userId}`;
        
        // 1. Check Redis Cache
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        // 2. Fetch from MongoDB if not cached
        const history = await ChatLog.find({ phone: userId })
            .sort({ timestamp: -1 })
            .limit(10);
        
        const formattedHistory = history.reverse().map(msg => {
            // Map our descriptive DB roles back to Gemini's strict roles
            const validRole = (msg.role === 'user_voice' || msg.role === 'user') ? 'user' : 'model';
            return {
                role: validRole,
                parts: [{ text: msg.message }] 
            };
        });

        // 3. Save to Redis Cache (expire after 1 hour)
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(formattedHistory));
        
        return formattedHistory;
    } catch (error) {
        console.error("❌ History Fetch Error:", error.message);
        return [];
    }
}

// ... rest of your file (checkUser, handleLongTermMemory)
// ... keep checkUser and handleLongTermMemory as they are
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
        console.log(`🧹 Extracting memory for ${user.name}...`);
        const history = await getHistory(user.phone);
        
        const currentProfile = {
            summary: user.summary,
            language: user.language,
            preferences: user.preferences,
            accountReferences: user.accountReferences
        };
        
        const newProfile = await extractUserProfile(history, currentProfile);
        
        if (newProfile) {
            user.summary = newProfile.summary || user.summary;
            user.language = newProfile.language || user.language;
            user.preferences = newProfile.preferences || user.preferences;
            
            if (Array.isArray(newProfile.accountReferences)) {
                const mergedRefs = new Set([...user.accountReferences, ...newProfile.accountReferences]);
                user.accountReferences = Array.from(mergedRefs);
            }
            
            user.messageCountSinceLastSummary = 0;
            await user.save();
        }
    }
}