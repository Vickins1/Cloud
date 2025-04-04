const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const productSchema = new Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String },
    stockQuantity: { type: Number, required: true },
    category: { 
        type: String, 
        required: true,
    },
    quantityType: { 
        type: String, 
        required: true,
        enum: ['piece', 'gram', 'pack'],
        default: 'piece'
    },
    imageUrl: { type: String, required: true },
    additionalImages: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);