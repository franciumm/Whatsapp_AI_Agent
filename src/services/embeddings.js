import { GoogleGenAI } from '@google/genai';
import redisClient from '../config/redis.js';
import 'dotenv/config';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateEmbedding(text) {
    const response = await ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: text,
        config: { outputDimensionality: 768 } // or 3072 for full quality
    });
    return response.embeddings[0].values;
}

export function chunkText(text, maxChars = 1000) {
    const chunks = [];
    const paragraphs = text.split('\n\n');
    let currentChunk = '';

    for (const p of paragraphs) {
        if ((currentChunk.length + p.length) > maxChars && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        currentChunk += p + '\n\n';
    }
    
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}

export async function createVectorIndex() {
    try {
        await redisClient.ft.create('idx:knowledge', {
            '$.source': {
                type: 'TEXT',
                AS: 'source'
            },
            '$.content': {
                type: 'TEXT',
                AS: 'content'
            },
            '$.embedding': {
                type: 'VECTOR',
                ALGORITHM: 'HNSW',
                TYPE: 'FLOAT32',
                DIM: 768, 
                DISTANCE_METRIC: 'COSINE',
                AS: 'embedding'
            }
        }, {
            ON: 'JSON',
            PREFIX: 'knowledge:'
        });
        console.log("✅ Vector Index created successfully.");
    } catch (e) {
        if (e.message.includes('Index already exists')) {
            console.log("ℹ️ Vector Index already exists.");
        } else {
            console.error("❌ Vector Index error:", e);
        }
    }
}
