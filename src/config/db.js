import mongoose from 'mongoose';
import 'dotenv/config'; // Loads .env variables

// ✅ Notice the 'export' keyword before 'const'
export const connectDB = async () => {
    try {
        if (!process.env.DATABASE_URL) {
            throw new Error("DATABASE_URL is missing in .env file");
        }
        const conn = await mongoose.connect(process.env.DATABASE_URL);
        console.log(`🍃 MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};