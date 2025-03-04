const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose'); 
const Product = require('../models/product');
const Cart = require('../models/cart'); 
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './public/uploads');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

// Middleware to ensure authentication
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error_msg', 'Please log in to view that resource');
  res.redirect('/auth/login');
}

// Get all products (existing route)
router.get("/",ensureAuthenticated, async (req, res) => {
  try {
    const products = await Product.find();
    res.render("products", { 
      products, 
      cartItems: req.session.cartItems || 0, 
      isAuthenticated: req.isAuthenticated || false 
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Server Error");
  }
});

// Fetch a specific product by ID (JSON response)
router.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ error: 'Unable to fetch product' });
  }
});

// Add a new product
router.post('/add', upload.single('image'), async (req, res) => {
  try {
    const newProduct = new Product({
      name: req.body.name,
      price: req.body.price,
      description: req.body.description,
      image: req.file.filename
    });
    await newProduct.save();
    res.redirect('/');
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Fetch a specific product by ID (alternative route)
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).send({ error: 'Product not found' });
    res.send(product);
  } catch (err) {
    res.status(500).send({ error: 'Unable to fetch product' });
  }
});

// Route to get cart count
router.get('/cart-count', async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const cart = await Cart.findOne({ userId: req.user._id });
    const cartCount = cart ? cart.products.reduce((total, item) => total + item.quantity, 0) : 0;
    res.json({ cartCount });
  } catch (error) {
    console.error('Error fetching cart count:', error);
    res.status(500).json({ error: 'Error fetching cart count' });
  }
});

// New route for filtering products
router.post('/filter', async (req, res) => {
  try {
    const { search, category } = req.body;

    // Build the query object
    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    if (category && category !== '') {
      query.category = category; // Exact match on category
    }

    // Fetch filtered products from the database
    const products = await Product.find(query);
    res.json(products); // Send JSON response to frontend
  } catch (error) {
    console.error('Error filtering products:', error);
    if (error instanceof mongoose.Error) {
      res.status(400).json({ error: 'Invalid query' });
    } else {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

module.exports = router;