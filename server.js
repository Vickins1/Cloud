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
const { ObjectId } = require('mongoose').Types;
const User = require('./models/user');
const { isLoggedIn } = require('./middleware/auth');
const cartRoutes = require('./routes/cart');
const paymentRouter = require('./routes/payment');
const trackOrderRoute = require('./routes/trackOrder');
const orderRoutes = require('./routes/order');
const checkoutRoutes = require('./routes/checkout');
const Order = require('./models/order');
const Cart = require('./models/cart');
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

const getUser = async (userId) => {
  try {
      const user = await User.findById(userId);
      return user;
  } catch (error) {
      console.error("Error fetching user:", error);
      return null;
  }
};

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

// Home page route
app.get('/home', isLoggedIn, async (req, res) => {
  try {
    const products = await Product.find();
    res.render('home', { products, user: req.user, featuredProducts: products, cartItems: req.session.cartItems || 0, isAuthenticated: req.isAuthenticated });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).send('Server Error');
  }
});

app.get("/", async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    let cartItems = 0;
    if (userId) {
      const cart = await Cart.findOne({ userId });
      cartItems = cart ? cart.products.length : 0;
    }
    res.render("index", { cartItems, isAuthenticated: req.isAuthenticated() });
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).send("Internal Server Error");
  }
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

app.get("/cart-count", async (req, res) => {
  try {
      const cart = await Cart.findOne({ userId: req.user._id });
      const cartCount = cart ? cart.products.length : 0;
      res.json({ cartCount });
  } catch (error) {
      res.status(500).json({ error: "Failed to fetch cart count" });
  }
});

app.get('/about', (req, res) => {
  res.render('about', { title: 'About - Cloud 420', currentDate: new Date().toLocaleDateString(), cartItems: req.session.cartItems || 0, isAuthenticated: req.isAuthenticated });
});

// Profile Route (GET)
app.get('/profile', isLoggedIn, async (req, res) => {
  try {
    // Use req.user from Passport instead of req.session.userId
    const user = req.user;
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/auth/login');
    }

    // Fetch flash messages once and store them
    const errorMessages = req.flash('error_msg');
    const successMessages = req.flash('success_msg');

    // Use the first message if available, otherwise null
    const error = errorMessages.length > 0 ? errorMessages[0] : null;
    const success = successMessages.length > 0 ? successMessages[0] : null;

    res.render('profile', {
      title: 'Profile',
      user: {
        username: user.username,
        email: user.email
      },
      currentDate: new Date().toLocaleString(),
      isAuthenticated: true,
      cartItems: 0,
      error: error,
      success: success
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server error');
    res.redirect('/auth/login');
  }
});

// Change Password Route (POST)
app.post('/profile/change-password', isLoggedIn, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  try {
    // Use req.user from Passport
    const user = req.user;
    if (!user) {
      console.log('Error: User not found');
      req.flash('error_msg', 'User not found');
      return res.redirect('/profile');
    }

    // Verify current password
    const isMatch = await user.authenticate(currentPassword).user !== false;
    if (!isMatch) {
      console.log('Error: Current password is incorrect');
      req.flash('error_msg', 'Current password is incorrect');
      return res.redirect('/profile');
    }

    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      console.log('Error: New passwords do not match');
      req.flash('error_msg', 'New passwords do not match');
      return res.redirect('/profile');
    }

    // Validate new password
    if (newPassword.length < 6) {
      console.log('Error: New password must be at least 6 characters');
      req.flash('error_msg', 'New password must be at least 6 characters');
      return res.redirect('/profile');
    }

    // Update password using Passport-Local-Mongoose setPassword
    await new Promise((resolve, reject) => {
      user.setPassword(newPassword, (err) => {
        if (err) {
          console.log('Error setting new password:', err);
          reject(err);
        } else {
          console.log('Password set successfully');
          resolve();
        }
      });
    });
    await user.save();
    console.log('Success: Password changed successfully');
    req.flash('success_msg', 'Password changed successfully');
    res.redirect('/profile');
  } catch (err) {
    console.error('Server error in change-password route:', err);
    req.flash('error_msg', 'Server error');
    res.redirect('/profile');
  }
});

// 404 Error Handling - Catch all unmatched routes
app.use((req, res, next) => {
  res.status(404).render('404', { title: '404 - Not Found', url: req.originalUrl });
});

// 500 Error Handling - Catch server errors
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('500', { title: '500 - Server Error', error: err.message });
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