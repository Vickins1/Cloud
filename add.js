const mongoose = require('mongoose');
const Product = require('./models/product');

const MONGO_URI = 'mongodb+srv://Admin:Kefini360@cluster0.5ib26.mongodb.net/Cloud-db?retryWrites=true&w=majority&appName=Cluster0';

// Connect to MongoDB
async function connectDB() {
    try {
        await mongoose.connect(MONGO_URI);
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
}

// Seed Products
async function seedProducts() {
    const products = [
        {
            name: 'Weed-Cake',
            description: 'A delicious cake infused with cannabis.',
            price: 1000.00,
            imageUrl: '/images/cake.png'
        }
    ];

    try {
        await Product.insertMany(products);
        console.log('Products added successfully!');
    } catch (err) {
        console.error('Error adding products:', err);
    } finally {
        mongoose.disconnect();
    }
}

// Run the script
(async () => {
    await connectDB();
    await seedProducts();
})();
