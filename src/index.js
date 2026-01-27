import wwebjs from 'whatsapp-web.js';
const { Client, LocalAuth } = wwebjs;
import qrcode from 'qrcode-terminal';
import { connectDB } from './config/db.js';
import { generateSmartResponse } from './services/ai.js';
import { saveMessage, getHistory, checkUser, handleLongTermMemory } from './services/memory.js';

connectDB();

// Simple processing queue to prevent race conditions
const processingUsers = new Set();

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'], headless: true }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('🚀 Agent is live!'));

client.on('message', async (msg) => {
    if (msg.isStatus || msg.fromMe || !msg.body) return;

    const contact = await msg.getContact();
    const userId = contact.number;

    // 1. Concurrency Check: If already processing this user, wait or ignore
    if (processingUsers.has(userId)) return; 
    processingUsers.add(userId);

    try {
        // 2. Load User Profile
        const user = await checkUser(contact);

        // 3. Fetch Context
        const history = await getHistory(userId);

        // 4. Generate AI response with Summary context
        const aiReply = await generateSmartResponse(history, msg.body, user.summary);

        // 5. Save and Respond
        await saveMessage(userId, 'user', msg.body);
        await saveMessage(userId, 'model', aiReply);
        await client.sendMessage(msg.from, aiReply);

        // 6. Maintenance (Run in background)
        handleLongTermMemory(user);

    } catch (error) {
        console.error("Critical Error:", error);
    } finally {
        // 7. Release the lock for this user
        processingUsers.delete(userId);
    }
});

process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    await client.destroy();
    console.log('✅ Browser closed. Exiting.');
    process.exit(0);
});
client.initialize();