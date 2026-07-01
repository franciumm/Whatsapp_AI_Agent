import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name: { type: String },
    summary: { type: String, default: "" }, // 🧠 The "Eternal Memory"
    language: { type: String, default: "en" },
    preferences: { type: String, default: "" },
    accountReferences: { type: [String], default: [] },
    status: { type: String, enum: ['bot', 'pending_human', 'human'], default: 'bot' },
    escalationReason: { type: String, default: "" },
    lastInteractionDate: { type: Date, default: Date.now },
    messageCountSinceLastSummary: { type: Number, default: 0 },
    role: { type: String, default: 'user' }, 
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', userSchema);