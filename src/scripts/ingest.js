import fs from 'fs';
import path from 'path';
import {PDFParse} from 'pdf-parse';
import * as XLSX from 'xlsx';
import redisClient from '../config/redis.js';
import { generateEmbedding, chunkText } from '../services/embeddings.js';
import 'dotenv/config';

async function extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.txt') {
        return fs.readFileSync(filePath, 'utf-8');
    }

    if (ext === '.pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const uint8Array = new Uint8Array(dataBuffer);
        const data = await new PDFParse(uint8Array);
        return data.text;
    }

    if (ext === '.xlsx' || ext === '.csv') {
        const workbook = XLSX.readFile(filePath);
        let fullContent = "";
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            fullContent += XLSX.utils.sheet_to_txt(sheet) + "\n";
        });
        return fullContent;
    }

    return null;
}

async function ingest() {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        const docsPath = path.resolve('./documents'); 
        if (!fs.existsSync(docsPath)) {
            console.error(`❌ Directory not found: ${docsPath}`);
            process.exit(1);
        }

        const files = fs.readdirSync(docsPath);
        if (files.length === 0) {
            console.log(`ℹ️ No files found in ${docsPath}. Please place your FAQ txt files here.`);
            process.exit(0);
        }

        let totalChunksStored = 0;

        for (const file of files) {
            const filePath = path.join(docsPath, file);
            console.log(`🔍 Checking ${file}...`);

            const rawText = await extractText(filePath);

            if (!rawText || rawText.trim().length < 10) {
                console.warn(`⚠️ Skipping ${file}: No readable text found.`);
                continue;
            }

            console.log(`📖 Extracted ${rawText.length} characters from ${file}.`);

            // Use our improved semantic chunking logic
            const chunks = chunkText(rawText, 1500);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                console.log(`  Generating embedding for chunk ${i+1}/${chunks.length}...`);
                
                try {
                    const embedding = await generateEmbedding(chunk);
                    const id = `knowledge:${file.replace(/[^a-zA-Z0-9_-]/g, '')}:${i}`;
                    
                    await redisClient.json.set(id, '$', {
                        source: file,
                        content: chunk,
                        embedding: embedding
                    });
                    totalChunksStored++;
                } catch (embedError) {
                    console.error(`  ❌ Failed to embed chunk ${i+1} of ${file}:`, embedError.message);
                }
            }
            console.log(`✅ Finished: ${file} (${chunks.length} chunks)`);
        }
        console.log(`\n🚀 All files processed! Stored ${totalChunksStored} total chunks in Redis.`);
    } catch (error) {
        console.error("❌ Ingestion Error:", error);
    } finally {
        process.exit();
    }
}

ingest();