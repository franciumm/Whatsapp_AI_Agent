export const toolDefinitions = [{
    functionDeclarations: [
        {
            name: "get_meeting_types",
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
        },
        {
            name: "lookup_order",
            description: "Look up the status of a customer's order.",
            parameters: {
                type: "OBJECT",
                properties: {
                    orderId: { type: "STRING" }
                },
                required: ["orderId"]
            }
        },
        {
            name: "search_faq",
            description: "Search the internal FAQ for general questions.",
            parameters: {
                type: "OBJECT",
                properties: {
                    query: { type: "STRING" }
                },
                required: ["query"]
            }
        },
        {
            name: "request_human_handoff",
            description: "Escalate the conversation to a human agent.",
            parameters: {
                type: "OBJECT",
                properties: {
                    reason: { type: "STRING", description: "Reason for escalation." }
                },
                required: ["reason"]
            }
        }
    ]
}];

export const toolHandlers = {
    get_meeting_types: async (args, context) => {
        return { success: true, data: [{ id: 1, name: "Consultation" }, { id: 2, name: "Intro" }] };
    },
    get_available_slots: async (args, context) => {
        return { success: true, data: ["2026-07-02T10:00:00Z", "2026-07-02T11:00:00Z"] };
    },
    create_booking: async (args, context) => {
        context.bookingData = { status: "success", data: { responses: { name: args.guestName } } };
        return { success: true, data: { status: "confirmed", ...args } };
    },
    lookup_order: async (args, context) => {
        return { success: true, data: { orderId: args.orderId, status: "shipped", trackingNumber: "TRK123456" } };
    },
    search_faq: async (args, context) => {
        return { success: true, data: "FAQ Result: Policies generally allow returns within 30 days." };
    },
    request_human_handoff: async (args, context) => {
        context.handoffRequested = true;
        context.handoffReason = args.reason;
        return { success: true, data: "Escalation requested." };
    }
};

export async function executeTool(name, args, context) {
    if (!toolHandlers[name]) {
        return { success: false, error: `Tool ${name} not found.` };
    }
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Tool timeout')), 5000));
        const handlerPromise = toolHandlers[name](args, context);
        return await Promise.race([handlerPromise, timeoutPromise]);
    } catch (e) {
        return { success: false, error: e.message };
    }
}
