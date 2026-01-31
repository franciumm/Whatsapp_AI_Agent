import { GoogleGenerativeAI } from "@google/generative-ai";
import Knowledge from '../models/Knowledge.js'; 
import * as scheduler from './scheduler.js';    
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = "gemini-2.0-flash-exp"; 

const tools = [{
    functionDeclarations: [
        {   name: "get_meeting_types", // 👈 The discovery tool
            description: "Retrieve a list of available meeting types (Consultation, Intro, etc.) and their IDs."
        },
        {
            name: "get_meeting_types",
            description: "Fetch the types of meetings available for booking."
        },
        {
            name: "get_available_slots", // ✅ NEW TOOL
            description: "Check available time slots for a specific meeting type within a date range.",
            parameters: {
                type: "OBJECT",
                properties: {
                    eventTypeId: { type: "NUMBER" },
                    start: { type: "STRING", description: "ISO 8601 start date (e.g. 2025-01-28)" },
                    end: { type: "STRING", description: "ISO 8601 end date (e.g. 2025-01-30)" }
                },
                required: ["eventTypeId", "start", "end"]
            }
        },
        {
            name: "create_booking",
            description: "Create a new calendar booking.",
            parameters: {
                
                type: "OBJECT",

                properties: {
                    eventTypeId: { type: "NUMBER" },
                    start: { type: "STRING", description: "ISO 8601 format in UTC timezone" },
                    guestName: { type: "STRING" },
                    guestEmail: { type: "STRING" },
                    notes: { type: "STRING", description: "A brief reason for the meeting or any additional information." }, 

                },
                required: ["eventTypeId", "start", "guestName", "guestEmail",  "notes"]
            }
        }
    ]
}];


export async function generateSmartResponse(history, newMessage, userSummary, mediaData = null) {
    try {
        const knowledge = await getRelevantContext(newMessage);
        const now = new Date();
        const dubaiTimeStr = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long', timeZone: 'Asia/Dubai' }).format(now);
        const utcTimeStr = now.toISOString();

        const model = genAI.getGenerativeModel({ 
            model: MODEL_NAME,
            tools: tools,
            systemInstruction: `You are an elite personal assistant in Dubai.
            CURRENT DUBAI TIME: ${dubaiTimeStr}.
            CURRENT UTC ISO TIME: ${utcTimeStr}.
            USER PROFILE: ${userSummary || "New User"}.
            KNOWLEDGE BASE: ${knowledge}.
            "If the user wants to book but you don't know which event type to use, call get_meeting_types first to find the correct ID."
            RULES:
            1. BEFORE booking, always call get_available_slots to see what times are free.
            2. To check slots for "today" or "tomorrow", use a 2-day range for the start and end parameters.
            3. Present available slots to the user in Dubai time (+4).`
        });

        const chat = model.startChat({ history });
        let parts = mediaData ? [{ inlineData: { data: mediaData.data, mimeType: mediaData.mimeType } }, { text: newMessage }] : newMessage;

        let result = await chat.sendMessage(parts);
        let response = result.response;

        // --- ENHANCED TOOL LOOP ---
        const call = response.functionCalls()?.[0];
        if (call) {
            let toolRes;
            if (call.name === "get_meeting_types") {
                toolRes = await scheduler.getEventTypes();
            } 
            else if (call.name === "get_available_slots") {
                // ✅ Handle the new slots tool
                toolRes = await scheduler.getAvailableSlots(call.args.eventTypeId, call.args.start, call.args.end);
            }
            else if (call.name === "create_booking") {
                                toolRes = await scheduler.createBooking(
                    call.args.eventTypeId, 
                    call.args.start, 
                    call.args.guestName, 
                    call.args.guestEmail, 
                    call.args.notes
                );
            }

            const finalResult = await chat.sendMessage([{
                functionResponse: { name: call.name, response: { content: toolRes } }
            }]);
            
            return { text: finalResult.response.text(), bookingData: call.name === "create_booking" ? toolRes : null };
        }

        return { text: response.text() || "I'm processing...", bookingData: null };

    } catch (error) {
        console.error("AI Error:", error);
        return { text: "I'm having trouble checking my schedule. Can you try again?", bookingData: null };
    }
}
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


export async function summarizeHistory(history) {
    try {
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const prompt = `Summarize key facts about this user: ${JSON.stringify(history)}`;
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) { return null; }
}