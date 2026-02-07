import { GoogleGenerativeAI } from "@google/generative-ai";
import Knowledge from '../models/Knowledge.js'; 
import * as scheduler from './scheduler.js';    
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME =    "gemini-3-pro-preview";


const tools = [{
    functionDeclarations: [
        {   name: "get_meeting_types", 
            description: "Retrieve a list of available meeting types (Consultation, Intro, etc.) and their IDs."
        },

        {
            name: "get_available_slots",
            description: "Check available time slots for a specific meeting type within a date range.",
            parameters: {
                type: "OBJECT",
                properties: {
                    eventTypeId: { type: "NUMBER" },
                    end: { type: "STRING", description: "ISO 8601 end date (e.g. 2025-01-30)" }
                },
                required: ["eventTypeId", "end"]
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
        
        const model = genAI.getGenerativeModel({ 
            model: MODEL_NAME,
            tools: tools,
            systemInstruction: `You are an elite personal assistant in Dubai.
            CURRENT DUBAI TIME: ${dubaiTimeStr}.
            USER PROFILE: ${userSummary || "New User"}.
            KNOWLEDGE BASE: ${knowledge}.
            RULES:
            1. If you don't know the Event ID, call get_meeting_types first.
            2. ALWAYS call get_available_slots before booking.
            3. If the user asks to book, and you have the slot, call create_booking.
            4. Keep responses concise and professional.`
        });

        const chat = model.startChat({ history });
        let parts = mediaData ? [{ inlineData: { data: mediaData.data, mimeType: mediaData.mimeType } }, { text: newMessage }] : newMessage;

        // 1. Send initial message
        let result = await chat.sendMessage(parts);
        let response = result.response;
        let bookingData = null;

        // 2. ✅ THE FIX: Loop to handle MULTIPLE tool calls
        // The AI might want to check Types -> Then Slots -> Then Book.
        while (response.functionCalls() && response.functionCalls().length > 0) {
            const call = response.functionCalls()[0];
            let toolRes;

            console.log(`🛠️ AI Requesting Tool: ${call.name}`);

            if (call.name === "get_meeting_types") {
                toolRes = await scheduler.getEventTypes();
            } 
            else if (call.name === "get_available_slots") {
                toolRes = await scheduler.getAvailableSlots(call.args.eventTypeId,  new Date().toISOString(), call.args.end);
            }
            else if (call.name === "create_booking") {
                toolRes = await scheduler.createBooking(
                    call.args.eventTypeId, 
                    call.args.start, 
                    call.args.guestName, 
                    call.args.guestEmail, 
                    call.args.notes
                );
                bookingData = toolRes; 
                   
            }

            result = await chat.sendMessage([{
                functionResponse: { name: call.name, response: { content: toolRes } }
            }]);
            response = result.response;
        }

        // 4. Return final text (fallback to empty string if nil)
        const finalText = response.text() || "I completed the action.";
        return { text: finalText, bookingData };

    } catch (error) {
        console.error("AI Error:", error);
        return { text: "I'm encountering a temporary system error. Please try again.", bookingData: null };
    }
}

async function getRelevantContext(query) {
    try {
        // Fetch all knowledge documents
        const allKnowledge = await Knowledge.find({}).limit(50);
        
        if (allKnowledge.length === 0) return "";
        
        // Use AI to intelligently select relevant documents
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const knowledgeList = allKnowledge.map((doc, idx) => 
            `[${idx}] Source: ${doc.metadata.source}\nContent: ${doc.content}`
        ).join("\n\n");
        
        const selectionPrompt = `Given this user query: "${query}"
        
Select the most relevant knowledge documents (by index number) that could help answer or provide context. Be lenient with typos and focus on semantic meaning.
        
${knowledgeList}

Respond with a JSON object: { "relevantIndices": [0, 2, 5], "reason": "brief explanation" }`;
        
        const result = await model.generateContent(selectionPrompt);
        const responseText = result.response.text();
        
        // Parse AI's selection
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return "";
        
        const { relevantIndices } = JSON.parse(jsonMatch[0]);
        
        // Build context from selected documents
        return relevantIndices
            .map(idx => allKnowledge[idx])
            .filter(Boolean)
            .map(doc => `[Source: ${doc.metadata.source}]: ${doc.content}`)
            .join("\n\n");
            
    } catch (e) { 
        console.error("Knowledge context error:", e);
        return ""; 
    }
}


export async function summarizeHistory(history) {
    try {
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const prompt = `Summarize key facts about this user: ${JSON.stringify(history)}`;
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) { return null; }
}