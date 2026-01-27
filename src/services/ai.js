import { GoogleGenerativeAI } from "@google/generative-ai";
import Knowledge from '../models/Knowledge.js'; 
import * as scheduler from './scheduler.js';    
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = "gemini-2.0-flash-exp"; 

const tools = [{
    functionDeclarations: [
        {
            name: "get_meeting_types",
            description: "Fetch the types of meetings available for booking."
        },
        {
            name: "create_booking",
            description: "Create a new calendar booking.",
            parameters: {
                type: "OBJECT",
                properties: {
                    eventTypeId: { type: "NUMBER" },
                    start: { type: "STRING", description: "ISO 8601 format, e.g., 2025-01-27T10:00:00Z" },
                    guestName: { type: "STRING" },
                    guestEmail: { type: "STRING" }
                },
                required: ["eventTypeId", "start", "guestName", "guestEmail"]
            }
        }
    ]
}];

async function getRelevantContext(query) {
    try {
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const embeddingRes = await model.embedContent(query);
        const results = await Knowledge.aggregate([{
            "$vectorSearch": {
                "index": "vector_index",
                "path": "embedding",
                "queryVector": embeddingRes.embedding.values,
                "numCandidates": 100,
                "limit": 3
            }
        }]);
        return results.map(r => `[Source: ${r.metadata.source}]: ${r.content}`).join("\n\n");
    } catch (e) { return ""; }
}
// ... (keep imports and tools definitions)

export async function generateSmartResponse(history, newMessage, userSummary, mediaData = null) {
    try {
        const knowledge = await getRelevantContext(newMessage);
        const nowInDubai = new Intl.DateTimeFormat('en-GB', {
            dateStyle: 'full', timeStyle: 'long', timeZone: 'Asia/Dubai'
        }).format(new Date());

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash-exp",
            tools: tools,
            systemInstruction: `You are an elite personal assistant in Dubai.
            CURRENT TIME: ${nowInDubai}.
            USER SUMMARY: ${userSummary || "New User"}.
            KNOWLEDGE BASE: ${knowledge}.
            
            ADVICE: If the user sends audio, they expect a helpful text response in the same language (Arabic/English mix).`
        });

        const chat = model.startChat({ history });

        // Build Multi-part message for Gemini
        let parts = [];
        if (mediaData) {
            parts.push({
                inlineData: {
                    data: mediaData.data,
                    mimeType: mediaData.mimeType
                }
            });
        }
        parts.push({ text: newMessage });

        const result = await chat.sendMessage(parts);
        const response = result.response;

        // Handle Potential Function Call (Scheduler)
        const call = response.functionCalls()?.[0];
        if (call) {
            let toolRes;
            if (call.name === "get_meeting_types") toolRes = await scheduler.getEventTypes();
            if (call.name === "create_booking") toolRes = await scheduler.createBooking(call.args.eventTypeId, call.args.start, call.args.guestName, call.args.guestEmail);

            const final = await chat.sendMessage([{
                functionResponse: { name: call.name, response: { content: toolRes } }
            }]);
            
            return { 
                text: final.response.text(), 
                bookingData: call.name === "create_booking" ? toolRes : null 
            };
        }

        return { text: response.text(), bookingData: null };

    } catch (error) {
        console.error("AI processing error:", error);
        return { text: "I'm sorry, I'm having trouble processing that right now.", bookingData: null };
    }
}
/**
 * 🧹 The Janitor: Summarize for Long-term Memory
 */
export async function summarizeHistory(history) {
    try {
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const prompt = `Summarize this chat into a few bullet points about the user's identity and preferences: ${JSON.stringify(history)}`;
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        return null;
    }
}