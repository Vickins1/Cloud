const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, required: true }
    }],
    status: { type: String, default: 'Pending' },
    estimatedDelivery: { type: Date }
}, { timestamps: true }); // Automatically includes createdAt and updatedAt fields

// Add indexes if you frequently query by certain fields
orderSchema.index({ customerEmail: 1 }); // Index for fast lookups by customer email

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
