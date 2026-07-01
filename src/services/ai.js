import { GoogleGenerativeAI } from "@google/generative-ai";
import { toolDefinitions, executeTool } from './tools.js';
import redisClient from '../config/redis.js';
import { generateEmbedding } from './embeddings.js';
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME =    "gemini-3-pro-preview";


export async function generateSmartResponse(history, newMessage, userProfile, mediaData = null) {
    try {
        const knowledge = await getRelevantContext(newMessage);
        const now = new Date();
        const dubaiTimeStr = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long', timeZone: 'Asia/Dubai' }).format(now);
        
        const model = genAI.getGenerativeModel({ 
            model: MODEL_NAME,
            tools: toolDefinitions,
            systemInstruction: `You are an elite personal assistant in Dubai.
            CURRENT DUBAI TIME: ${dubaiTimeStr}.
            USER PROFILE: ${JSON.stringify(userProfile) || "New User"}.
            KNOWLEDGE BASE: ${knowledge}.
            RULES:
            1. Use tools to look up orders, check availability, or create bookings when requested.
            2. If you don't know the Event ID, call get_meeting_types first.
            3. ALWAYS call get_available_slots before booking.
            4. If the user asks to book, and you have the slot, call create_booking.
            5. If the user explicitly asks for a human or the conversation is stuck, use request_human_handoff.
            6. Keep responses concise and professional.`
        });

        const chat = model.startChat({ history });
        let parts = mediaData ? [{ inlineData: { data: mediaData.data, mimeType: mediaData.mimeType } }, { text: newMessage }] : newMessage;

        // 1. Send initial message
        let result = await chat.sendMessage(parts);
        let response = result.response;
        
        let context = { bookingData: null, handoffRequested: false, handoffReason: "" };
        let iterationCount = 0;
        const MAX_ITERATIONS = 5;

        // 2. Loop to handle MULTIPLE tool calls with a cap
        while (response.functionCalls() && response.functionCalls().length > 0 && iterationCount < MAX_ITERATIONS) {
            iterationCount++;
            const call = response.functionCalls()[0];
            
            console.log(`🛠️ AI Requesting Tool: ${call.name} (Iteration ${iterationCount})`);

            const toolRes = await executeTool(call.name, call.args, context);

            result = await chat.sendMessage([{
                functionResponse: { name: call.name, response: { content: toolRes } }
            }]);
            response = result.response;
        }

        if (iterationCount >= MAX_ITERATIONS && response.functionCalls() && response.functionCalls().length > 0) {
            console.log("⚠️ Max tool iterations reached.");
        }

        // 4. Return final text (fallback to empty string if nil)
        const finalText = response.text() || "I completed the action.";
        return { 
            text: finalText, 
            bookingData: context.bookingData, 
            handoffRequested: context.handoffRequested, 
            handoffReason: context.handoffReason 
        };

    } catch (error) {
        console.error("AI Error:", error);
        return { text: "I'm encountering a temporary system error. Please try again.", bookingData: null, handoffRequested: false };
    }
}

async function getRelevantContext(query) {
    try {
        if (!redisClient.isOpen) await redisClient.connect();
        
        // 1. Generate embedding for query
        const queryEmbedding = await generateEmbedding(query);
        
        // 2. Format embedding to buffer for Redis Search
        const float32Array = new Float32Array(queryEmbedding);
        const embeddingBuffer = Buffer.from(float32Array.buffer);

        // 3. Perform Vector Search (Top 5 results)
        const results = await redisClient.ft.search(
            'idx:knowledge',
            '*=>[KNN 5 @embedding $query_vec AS score]',
            {
                PARAMS: {
                    query_vec: embeddingBuffer
                },
                RETURN: ['source', 'content', 'score'],
                SORTBY: 'score',
                DIALECT: 2
            }
        );

        if (results.total === 0) return "";

        // Build context from selected documents
        return results.documents
            .map(doc => `[Source: ${doc.value.source}]: ${doc.value.content}`)
            .join("\n\n");
            
    } catch (e) { 
        console.error("Knowledge context error:", e);
        return ""; 
    }
}


export async function extractUserProfile(history, currentProfile) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: MODEL_NAME,
            generationConfig: { responseMimeType: "application/json" }
        });
        const prompt = `Analyze this conversation history and extract user profile facts.
Current Profile: ${JSON.stringify(currentProfile)}
Conversation: ${JSON.stringify(history)}
Return a JSON object with these exact keys:
{
  "summary": "Updated summary of the user and their situation",
  "language": "Detected language (e.g. en, ar)",
  "preferences": "User preferences mentioned",
  "accountReferences": ["Any order IDs, emails, or reference numbers mentioned"]
}
Merge new facts with the current profile intelligently. Do not lose old facts unless contradicted.`;
        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text());
    } catch (e) {
        console.error("Profile extraction error:", e);
        return null;
    }
}
