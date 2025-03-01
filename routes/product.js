const express = require('express');
const multer = require('multer');
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

const fetchProducts = async (req, res) => {
  try {
    const products = await Product.find();
    const user = req.user ? req.user : null;
    res.render('products', { products, user });
  } catch (error) {
    console.error('Error fetching products:', error);
    if (error instanceof mongoose.Error) {
      res.status(404).send('Products not found');
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
};

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
      return next();
  }
  req.flash('error_msg', 'Please log in to view that resource');
  res.redirect('/auth/login');
}

router.get('/', ensureAuthenticated, fetchProducts);


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

// Fetch a specific product by ID 
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

module.exports = router;
