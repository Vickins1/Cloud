// models/SupportMessage.js
const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    orderNumber: { type: String },
    message: { type: String, required: true },
    status: { type: String, default: 'Pending', enum: ['Pending', 'Resolved'] },
    reply: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SupportMessage', supportMessageSchema);