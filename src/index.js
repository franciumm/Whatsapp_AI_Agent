import wwebjs from 'whatsapp-web.js';
const { Client, LocalAuth } = wwebjs; 
import qrcode from 'qrcode-terminal';
import { connectDB } from './config/db.js';

// Import our new services
import { generateSmartResponse } from './services/ai.js'; 
import { saveMessage, getHistory, checkUser } from './services/memory.js';

// 1. Connect to MongoDB
connectDB();

const sessions = {};

function createClient(sessionId) {
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId }),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: true 
        }
    });

    client.on('qr', (qr) => {
        console.log(`\n📱 [${sessionId}] Scan QR Code:`);
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log(`\n✅ [${sessionId}] Client Ready & Connected to DB!`);
    });

    client.on('message', async (msg) => {
        try {
            if (msg.isStatus || msg.fromMe || !msg.body) return;

            const contact = await msg.getContact();
            const userId = contact.number; // Unique Phone Number

            console.log(`📩 [${contact.pushname}]: ${msg.body}`);

            // A. Ensure User is in DB
            await checkUser(contact);

            // B. Get Previous Context
            const history = await getHistory(userId);

            // C. Get AI Response (Passing history + new message)
            const aiReply = await generateSmartResponse(history, msg.body);

            // D. Save the Interaction to DB
            await saveMessage(userId, 'user', msg.body);       // Save User Input
            await saveMessage(userId, 'model', aiReply);       // Save AI Output

            // E. Send Reply (Crash Safe)
            await client.sendMessage(msg.from, aiReply);
            console.log(`🤖 Replied: ${aiReply.substring(0, 30)}...`);

        } catch (error) {
            console.error(`❌ Message Error:`, error.message);
        }
    });

    client.initialize();
    return client;
}

createClient('main_bot');