const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    orderId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Order', 
        required: false
    },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed', 'error'],
        default: 'pending',
        required: true 
    },
    
    transactionRequestId: { 
        type: String, 
        required: true, 
        unique: true 
    },

    amount: { type: Number },
    paymentMethod: { type: String },
    customerPhone: { type: String },
    paymentReference: { type: String },
    gatewayResponse: { type: Object },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);