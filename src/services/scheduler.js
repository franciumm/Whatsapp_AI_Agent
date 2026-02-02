import axios from 'axios';
import 'dotenv/config';

const CAL_API_BASE = "https://api.cal.com/v2";
const API_KEY = process.env.CAL_API_KEY;

const calClient = axios.create({
    baseURL: CAL_API_BASE,
    headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
    }
});
export async function getEventTypes() {
    try {
        const response = await calClient.get('/event-types', {
            headers: { 'cal-api-version': '2024-06-14' } // ✅ Matches your Doc
        });
        
        // Map the results so Gemini sees clean, relevant data
        return response.data.data.map(et => ({
            id: et.id,               // The critical ID needed for other tools
            title: et.title,         // Human name (e.g., "Consultation")
            slug: et.slug,           // URL name
            length: et.lengthInMinutes,
            description: et.description || "No description provided."
        }));
    } catch (error) {
        console.error("Cal.com GetEventTypes Error:", error.response?.data || error.message);
        return { error: "Failed to retrieve event types from Cal.com" };
    }
}

export async function createBooking(eventTypeId, startTimeUtc, guestName, guestEmail, notes) {
    try {
        const response = await calClient.post('/bookings', {
            start: startTimeUtc,
            eventTypeId: Number(eventTypeId),
            attendee: {
                name: guestName,
                email: guestEmail,
                timeZone: "Asia/Dubai",
                language: "en"
            },
            // ✅ ELITE FIX: The 'notes' field goes here per the error log
            bookingFieldsResponses: {
                notes: notes || "Booking requested via AI Assistant"
            }
        }, {
            headers: { 'cal-api-version': '2024-08-13' }
        });
        return { status: "success", data: response.data.data };
    } catch (error) {
        console.error("Cal.com CreateBooking Error:", error.response?.data || error.message);
        return { status: "error", message: error.response?.data?.error?.message || "Booking failed." };
    }
}

export async function getAvailableSlots(eventTypeId, start, end) {
    try {
        const response = await calClient.get('/slots', {
            params: { 
                eventTypeId: Number(eventTypeId), 
                start: start,  
                end: end      
            },
            headers: { 'cal-api-version': '2024-09-04' } 
        });

        return response.data.data.slots || response.data.data;
    } catch (error) {
        console.error("Cal.com Slots Error:", error.response?.data || error.message);
        return { error: "I couldn't find any open slots for those dates." };
    }
}
