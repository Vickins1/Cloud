const mongoose = require('mongoose');


const orderSchema = new mongoose.Schema({
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerLocation: { type: String, required: true },
    total: { type: Number, required: true },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        quantity: { type: Number, required: true },
        price: { type: Number }
    }],
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending' 
    },
    shippingStatus: { 
        type: String, 
        enum: ['Not Shipped', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Processing' 
    },
    transactionRequestId: { type: String },
    paymentDetails: { type: Object },
    estimatedDeliveryDate: { 
        type: Date,
        default: () => new Date(+new Date() + 48*60*60*1000)
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);