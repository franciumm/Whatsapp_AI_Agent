import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name: { type: String },
    summary: { type: String, default: "" }, // 🧠 The "Eternal Memory"
    messageCountSinceLastSummary: { type: Number, default: 0 },
    role: { type: String, default: 'user' }, 
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', userSchema);