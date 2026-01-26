import mongoose from 'mongoose';

const chatLogSchema = new mongoose.Schema({
    phone: { type: String, required: true, index: true },
    role: { type: String, required: true }, // 'user' or 'model'
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('ChatLog', chatLogSchema);