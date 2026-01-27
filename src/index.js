import wwebjs from 'whatsapp-web.js';
const { Client, LocalAuth } = wwebjs;
import qrcode from 'qrcode-terminal';
import { connectDB } from './config/db.js';
import { handleIncomingMessage } from './services/messageHandler.js';

await connectDB();

const client = new Client({
    authStrategy: new LocalAuth({ 
        clientId: "main_bot",
        dataPath: "./sessions" 
    }),
    // Force a specific stable web version to minimize UI shifts
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014111620-alpha.html',
    },
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));

/**
 * ✅ THE ELITE PATCH
 * This hooks into the browser and kills the 'sendSeen' function 
 * which is the source of the 'markedUnread' crash.
 */
client.on('ready', async () => {
    console.log('🚀 AGENT ONLINE');
    
    // surgical injection into the Puppeteer page
    await client.pupPage.evaluate(() => {
        const interval = setInterval(() => {
            if (window.WWebJS && window.WWebJS.sendSeen) {
                // Override the broken library function with a dummy success function
                window.WWebJS.sendSeen = (chatId) => {
                    return Promise.resolve(true);
                };
                console.log('✅ WWebJS.sendSeen Patched Successfully');
                clearInterval(interval);
            }
        }, 500);
    });
});

client.on('message', async (msg) => {
    try {
        await handleIncomingMessage(client, msg);
    } catch (err) {
        console.error("Defensive Trap:", err.message);
    }
});

client.initialize();

process.on('SIGINT', async () => {
    await client.destroy();
    process.exit(0);
});