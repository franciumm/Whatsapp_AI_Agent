import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = "gemini-2.0-flash-exp"; // Or "gemini-1.5-flash"

export async function generateSmartResponse(history, newMessage) {
    try {
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        // Start a chat session with the history from MongoDB
        const chat = model.startChat({
            history: history, // Injecting the DB history here
            generationConfig: {
                maxOutputTokens: 500,
            },
        });

        const result = await chat.sendMessage(newMessage);
        const response = await result.response;
        return response.text();

    } catch (error) {
        console.error("❌ Brain Error:", error.message);
        // Simple fallback if history fails
        return "I'm having trouble recalling our past context, but I heard you.";
    }
}