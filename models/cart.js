const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cartSchema = new mongoose.Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    products: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: [1, 'Quantity must be at least 1'],
            default: 1
        },
        quantityType: {
            type: String,
            enum: ['piece', 'gram', 'pack'],
            required: true,
            default: 'piece'
        }
    }]
}, {
    timestamps: true
});

// Instance method to populate products
cartSchema.methods.populateProducts = function() {
    return this.populate({
        path: 'products.productId',
        select: 'name price description stockQuantity'
    });
};

// Static method to find or create a cart for a user
cartSchema.statics.findOrCreate = async function(userId) {
    let cart = await this.findOne({ userId });
    if (!cart) {
        cart = new this({ userId, products: [] });
        await cart.save();
    }
    return cart;
};

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;