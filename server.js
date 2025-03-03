const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const passport = require('passport');
const Product = require('./models/product');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/product');
const LocalStrategy = require('passport-local').Strategy;
const MongoStore = require('connect-mongo');
const User = require('./models/user');
const { isLoggedIn } = require('./middleware/auth');
const cartRoutes = require('./routes/cart');
const fs = require('fs');
const multer = require('multer');
const checkoutRoutes = require('./routes/checkout');
const adminRouter = require('./routes/admin');
const Cart = require('./models/cart');
require('dotenv').config();
const os = require('os');

const app = express();
app.set('view engine', 'ejs');
app.set('trust proxy', 1);

// MongoDB connection URI
const uri = "mongodb://localhost:27017/Sphinx";  

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

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
module.exports = { app, upload };


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

// Set view engine and views path explicitly
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Passport setup
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'))

// Pass flash messages to all views
app.use((req, res, next) => {
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.isAdmin = req.user && req.user.isAdmin;
  res.locals.currentUser = req.user;
  res.locals.error_msg = req.flash('error_msg');
  res.locals.success_msg = req.flash('success_msg');
  next();
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to make user available in views
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/cart', cartRoutes);
app.use('/', checkoutRoutes);
app.use('/admin', adminRouter);

// Home page route
app.get('/home', isLoggedIn, async (req, res) => {
  try {
    const products = await Product.find();
    const success = req.flash('success_msg').length > 0 ? req.flash('success_msg')[0] : null;
    const error = req.flash('error_msg').length > 0 ? req.flash('error_msg')[0] : null;
    res.render('home', { 
      products, 
      user: req.user, 
      featuredProducts: products, 
      cartItems: req.session.cartItems || 0, 
      isAuthenticated: req.isAuthenticated(),
      success,
      error
    });
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
    const success = req.flash('success_msg').length > 0 ? req.flash('success_msg')[0] : null;
    const error = req.flash('error_msg').length > 0 ? req.flash('error_msg')[0] : null;
    res.render("index", { 
      cartItems, 
      isAuthenticated: req.isAuthenticated(),
      success,
      error
    });
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
  const success = req.flash('success_msg').length > 0 ? req.flash('success_msg')[0] : null;
  const error = req.flash('error_msg').length > 0 ? req.flash('error_msg')[0] : null;
  res.render('about', { 
    title: 'About - Cloud 420', 
    currentDate: new Date().toLocaleDateString(), 
    cartItems: req.session.cartItems || 0, 
    isAuthenticated: req.isAuthenticated(),
    success,
    error
  });
});

// Profile Route (GET)
app.get('/profile', isLoggedIn, async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/auth/login');
    }

    // Fetch flash messages directly in the route
    const errorMessages = req.flash('error_msg');
    const successMessages = req.flash('success_msg');
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
      error,
      success
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
    const user = req.user;
    if (!user) {
      console.log('Error: User not found');
      req.flash('error_msg', 'User not found');
      return res.redirect('/profile');
    }

    const isMatch = await user.authenticate(currentPassword).user !== false;
    if (!isMatch) {
      console.log('Error: Current password is incorrect');
      req.flash('error_msg', 'Current password is incorrect');
      return res.redirect('/profile');
    }

    if (newPassword !== confirmPassword) {
      console.log('Error: New passwords do not match');
      req.flash('error_msg', 'New passwords do not match');
      return res.redirect('/profile');
    }

    if (newPassword.length < 6) {
      console.log('Error: New password must be at least 6 characters');
      req.flash('error_msg', 'New password must be at least 6 characters');
      return res.redirect('/profile');
    }

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
  const success = req.flash('success_msg').length > 0 ? req.flash('success_msg')[0] : null;
  const error = req.flash('error_msg').length > 0 ? req.flash('error_msg')[0] : null;
  res.status(404).render('404', { 
    title: '404 - Not Found', 
    url: req.originalUrl,
    success,
    error
  });
});

// 500 Error Handling - Catch server errors
app.use((err, req, res, next) => {
  console.error(err.stack);
  const success = req.flash('success_msg').length > 0 ? req.flash('success_msg')[0] : null;
  const error = req.flash('error_msg').length > 0 ? req.flash('error_msg')[0] : null;
  res.status(500).render('500', { 
    title: '500 - Server Error', 
    error: err.message,
    success,
    error: error || 'Server Error' // Ensure an error message is always shown
  });
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