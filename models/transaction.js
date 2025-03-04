const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    // Reference to the associated order
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: false,
        index: true
    },

    // Transaction request ID from payment gateway
    transactionRequestId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Payment amount
    amount: {
        type: Number,
        required: true,
        min: 0
    },

    // Transaction status
    status: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
        default: 'Pending',
        required: true
    },

    // Payment method
    paymentMethod: {
        type: String,
        enum: ['Mobile', 'Card', 'Bank', 'Cash'],
        default: 'Mobile',
        required: true
    },

    // Customer phone number (useful for mobile payments)
    customerPhone: {
        type: String,
        required: false,
        match: [/^\+?[1-9]\d{1,14}$/, 'Please provide a valid phone number']
    },

    // Payment gateway response
    gatewayResponse: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now,
        required: true
    },

    completedAt: {
        type: Date,
        required: false
    },

    failedAt: {
        type: Date,
        required: false
    },

    // Additional metadata
    metadata: {
        type: Map,
        of: String,
        default: {}
    },

    // Reference used in payment initiation
    paymentReference: {
        type: String,
        required: true,
        index: true
    }
}, {
    // Enable timestamps
    timestamps: true,
    
    // Add virtuals when converting to JSON
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual to get duration of transaction
transactionSchema.virtual('duration').get(function() {
    if (this.status === 'Completed' && this.completedAt) {
        return this.completedAt - this.createdAt;
    }
    if (this.status === 'Failed' && this.failedAt) {
        return this.failedAt - this.createdAt;
    }
    return null;
});

// Index for common queries
transactionSchema.index({ status: 1, createdAt: 1 });
transactionSchema.index({ orderId: 1, status: 1 });

// Pre-save hook to set completedAt or failedAt
transactionSchema.pre('save', function(next) {
    if (this.isModified('status')) {
        if (this.status === 'Completed' && !this.completedAt) {
            this.completedAt = new Date();
        }
        if (this.status === 'Failed' && !this.failedAt) {
            this.failedAt = new Date();
        }
    }
    next();
});

// Method to update status
transactionSchema.methods.updateStatus = async function(newStatus, gatewayResponse = {}) {
    this.status = newStatus;
    this.gatewayResponse = { ...this.gatewayResponse, ...gatewayResponse };
    
    if (newStatus === 'Completed') {
        this.completedAt = new Date();
    }
    if (newStatus === 'Failed') {
        this.failedAt = new Date();
    }
    
    return await this.save();
};

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;