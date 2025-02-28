const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true, 
        trim: true 
    },
    description: {
        type: String,
        required: true, 
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: [0, 'Price must be a positive number'],
    },
    imageUrl: {
        type: String,
        required: true, 
        trim: true 
    },
    stockQuantity: { type: Number, default: 0 } // <--- added stockQuantity field
}, {
    timestamps: true 
});

module.exports = mongoose.model('Product', productSchema);