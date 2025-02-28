// seed.js
const mongoose = require('mongoose');
const Product = require('./models/product');

mongoose.connect('mongodb://localhost:27017/Sphinx',)

const products = [
 
    {
        name: 'Weed-cookie',
        description: 'A calming indica strain for relaxation.',
        price: 100.00,
        imageUrl: '/images/cookie.png'
    }
    // Add more products as needed
];

Product.insertMany(products)
    .then(() => {
        console.log('Products added successfully!');
        mongoose.disconnect();
    })
    .catch(err => {
        console.error('Error adding products:', err);
        mongoose.disconnect();
    });
