import { GoogleGenerativeAI } from "@google/generative-ai";
import Knowledge from '../models/Knowledge.js'; 
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = "gemini-2.0-flash-exp"; 

/**
 * 🔍 The Librarian: Search the Vector Database
 */
async function getRelevantContext(query) {
    try {
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const embeddingRes = await model.embedContent(query);
        const vector = embeddingRes.embedding.values;

        // Perform Vector Search in MongoDB
        const results = await Knowledge.aggregate([
            {
                "$vectorSearch": {
                    "index": "vector_index", // Must match the name in your Atlas Screenshot
                    "path": "embedding",
                    "queryVector": vector,
                    "numCandidates": 100,
                    "limit": 3 // Retrieve the top 3 most relevant matches
                }
            }
        ]);

        if (results.length === 0) return "No specific internal documents found for this query.";

        return results.map(r => `[Source: ${r.metadata.source}]: ${r.content}`).join("\n\n");
    } catch (error) {
        console.error("❌ Vector Search Error:", error.message);
        return "";
    }
}

/**
 * 🧠 The Brain: Generate Response with Context
 */
export async function generateSmartResponse(history, newMessage, userSummary) {
    try {
        // 1. Ask the Librarian for info
        const internalKnowledge = await getRelevantContext(newMessage);

        const model = genAI.getGenerativeModel({ 
            model: MODEL_NAME,
            systemInstruction: `You are a professional personal assistant. 
            USER PROFILE: ${userSummary || "New user"}.
            
            KNOWLEDGE BASE INFO:
            ${internalKnowledge}
            
            INSTRUCTIONS:
            1. Use the KNOWLEDGE BASE INFO above to answer questions.
            2. If the info isn't there, use your general knowledge but mention you didn't find it in your records.
            3. Be concise and friendly.`
        });

        const chat = model.startChat({
            history: history,
            generationConfig: { maxOutputTokens: 1000 },
        });

        const result = await chat.sendMessage(newMessage);
        const response = await result.response;
        return response.text();

    } catch (error) {
        console.error("❌ Brain Error:", error.message);
        return "I'm having a slight internal error. Could you try asking that again?";
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