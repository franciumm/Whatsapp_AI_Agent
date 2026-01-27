import axios from 'axios';
import 'dotenv/config';

const CAL_API_BASE = "https://api.cal.com/v2";
const API_KEY = process.env.CAL_API_KEY;

const calClient = axios.create({
    baseURL: CAL_API_BASE,
    headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'cal-api-version': '2024-06-11' // Current stable v2 version
    }
});

/**
 * 1. Fetch Event Types
 */
export async function getEventTypes() {
    try {
        const response = await calClient.get('/event-types');
        // Filter active event types
        return response.data.data.map(et => ({
            id: et.id,
            slug: et.slug,
            title: et.title,
            length: et.length,
            description: et.description
        }));
    } catch (error) {
        console.error("Cal.com GET Error:", error.response?.data || error.message);
        return { error: "Could not fetch event types" };
    }
}

/**
 * 2. Create a Booking
 */
export async function createBooking(eventTypeId, start, guestName, guestEmail) {
    try {
        const response = await calClient.post('/bookings', {
            eventTypeId: Number(eventTypeId),
            start: start, // ISO 8601 string
            responses: {
                name: guestName,
                email: guestEmail
            },
            timeZone: "Asia/Dubai", 
            language: "en",
            metadata: {}
        });
        return { status: "success", data: response.data.data };
    } catch (error) {
        console.error("Cal.com POST Error:", error.response?.data || error.message);
        return { 
            status: "error", 
            message: error.response?.data?.error?.message || "Time slot might be taken." 
        };
    }
}