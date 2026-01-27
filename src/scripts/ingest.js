import fs from 'fs';
import path from 'path';
import {PDFParse} from 'pdf-parse';
import * as XLSX from 'xlsx'; // New dependency for Excel/CSV
import { connectDB } from '../config/db.js';
import Knowledge from '../models/Knowledge.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    // 1. Handle Notepad (.txt)
    if (ext === '.txt') {
        return fs.readFileSync(filePath, 'utf-8');
    }

    // 2. Handle PDF (.pdf)
    if (ext === '.pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const uint8Array = new Uint8Array(dataBuffer);
        const data = await new PDFParse(uint8Array);
        return data.text;
    }

    // 3. Handle Excel/CSV (.xlsx, .csv)
    if (ext === '.xlsx' || ext === '.csv') {
        const workbook = XLSX.readFile(filePath);
        let fullContent = "";
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            // Convert sheet to readable text/JSON string
            fullContent += XLSX.utils.sheet_to_txt(sheet) + "\n";
        });
        return fullContent;
    }

    return null;
}

async function ingest() {
    try {
        await connectDB();
        const docsPath = path.resolve('./documents'); 
        const files = fs.readdirSync(docsPath);

        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

        for (const file of files) {
            const filePath = path.join(docsPath, file);
            console.log(`🔍 Checking ${file}...`);

            const rawText = await extractText(filePath);

            if (!rawText || rawText.trim().length < 10) {
                console.warn(`⚠️ Skipping ${file}: No readable text found.`);
                continue;
            }

            console.log(`📖 Extracted ${rawText.length} characters from ${file}.`);

            // Chunking (1000 chars per block)
            const chunks = rawText.match(/[\s\S]{1,1000}/g) || [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const result = await model.embedContent(chunk);
                const embedding = result.embedding.values;

                await Knowledge.create({
                    content: chunk,
                    metadata: { source: file, chunkIndex: i },
                    embedding: embedding
                });
            }
            console.log(`✅ Finished: ${file} (${chunks.length} chunks)`);
        }
        console.log("\n🚀 All files processed!");
    } catch (error) {
        console.error("❌ Ingestion Error:", error);
    } finally {
        process.exit();
    }
}

ingest();