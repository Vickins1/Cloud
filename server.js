const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const crypto = require('crypto');
const passport = require('passport');
const Product = require('./models/product');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/product');
const LocalStrategy = require('passport-local').Strategy;
const MongoStore = require('connect-mongo');
const User = require('./models/user');
const { isLoggedIn } = require('./middleware/auth');
const cartRoutes = require('./routes/cart');
const paymentRouter = require('./routes/payment');
const trackOrderRoute = require('./routes/trackOrder');
const orderRoutes = require('./routes/order');
const checkoutRoutes = require('./routes/checkout');
const PaymentUrl = require('./models/paymentUrl');
const PaymentNotification = require('./models/paymentNotification');
const Order = require('./models/order');
const axios = require('axios');
require('dotenv').config();
const os = require('os');

const app = express();
app.set('view engine', 'ejs');
app.set('trust proxy', 1);

// MongoDB connection URI
const uri = "mongodb+srv://Admin:Kefini360@cluster0.5ib26.mongodb.net/Cloud-db?retryWrites=true&w=majority&appName=Cluster0";

async function connectToDatabase() {
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
}
connectToDatabase();

// Removed CSP middleware
// app.use((req, res, next) => {
//   const nonce = crypto.randomBytes(16).toString('base64');
//   res.locals.nonce = nonce;
//   res.setHeader(
//     'Content-Security-Policy',
//     `default-src 'self'; ` +
//     `script-src 'self' 'nonce-${nonce}' https://code.jquery.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; ` +
//     `style-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; ` +
//     `img-src 'self' data:; ` +
//     `connect-src 'self' https://api.umeskiasoftwares.com`
//   );
//   next();
// });

// Session setup with MongoStore
app.use(session({
  secret: 'weed-secret',
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({
    mongoUrl: uri,
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Middleware for flash messages
app.use(flash());

// Global variables for flash messages
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});

// Passport setup
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public')); // Serve static files from 'public'

// Middleware to make user available in views
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/cart', cartRoutes);
app.use('/api', orderRoutes);
app.use('/payment', paymentRouter);
app.use('/api', trackOrderRoute);
app.use('/', checkoutRoutes);

// Initialize order and payment URL
app.post('/initialize-order', async (req, res) => {
  try {
    const { userId, productId, quantity, customerEmail, customerName } = req.body;

    if (!userId || !productId || !quantity || !customerEmail || !customerName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const newOrder = new Order({
      user_id: userId,
      items: [{ productId: mongoose.Types.ObjectId(productId), quantity }],
      total: product.price * quantity,
      customerEmail,
      customerName
    });

    const savedOrder = await newOrder.save();
    console.log('Order created:', savedOrder);

    const paymentUrl = new PaymentUrl({
      order_id: savedOrder._id,
      payment_url: `https://paymentgateway.com/pay?orderId=${savedOrder._id}`
    });

    const doc = await paymentUrl.save();
    console.log('Payment URL created:', doc);

    res.status(200).json({ order: savedOrder, paymentUrl: doc.payment_url });
  } catch (err) {
    console.error('Error initializing order:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Home page route
app.get('/home', isLoggedIn, async (req, res) => {
  try {
    const products = await Product.find();
    res.render('home', { products, user: req.user, featuredProducts: products });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).send('Server Error');
  }
});

// Landing page
app.get('/', (req, res) => {
  res.render('index');
});

// Get cart data
app.get('/cart/data', isLoggedIn, async (req, res) => {
  try {
    const cart = req.user.cart || [];
    res.status(200).json(cart);
  } catch (err) {
    console.error('Error fetching cart data:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Get local IP for logging
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Start server
app.listen(4200, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`Cloud 420 is running at:
    - Local: http://localhost:4200
    - Network: http://${localIP}:4200`);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unexpected error:', err.stack);
  res.status(500).send('Something went wrong!');
});