const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true // Ensure userId is mandatory
    },
    products: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
                required: true
            },
            quantity: {
                type: Number,
                required: true,
                min: 1
            }
        }
    ]
});

// Instance method to populate products
cartSchema.methods.populateProducts = function() {
    return this.populate({
        path: 'products.productId', // Populate the `productId` field within `products`
        select: 'name price description', // Optional: Select specific fields from the Product model
        strictPopulate: false // Optional: Bypass strict populate
    });
};

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
