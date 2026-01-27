import mongoose from 'mongoose';

const knowledgeSchema = new mongoose.Schema({
    content: { type: String, required: true },
    metadata: {
        source: String,
        page: Number
    },
    embedding: { 
        type: [Number], 
        index: true // We will configure the Vector Index in Atlas later
    }
});

export default mongoose.model('Knowledge', knowledgeSchema);