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
const Order = require('./models/order');
const fs = require('fs').promises;
const multer = require('multer');
const adminRouter = require('./routes/admin');
const Cart = require('./models/cart');
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

// Ensure upload directory exists
const uploadDir = 'public/uploads/';
(async () => {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log(`Upload directory ensured: ${uploadDir}`);
  } catch (error) {
    console.error(`Failed to create upload directory: ${error}`);
  }
})();

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
  },
});

// Multer upload configuration
const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10, // Max 10 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError('INVALID_FILE_TYPE', 'Only JPEG, PNG, GIF, and WEBP images are allowed'));
    }
  },
});

module.exports = { app, upload };

app.use(session({
  secret: process.env.SESSION_SECRET || 'weed-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: uri,
    ttl: 14 * 24 * 60 * 60,
    autoRemove: 'native',
    touchAfter: 24 * 3600,
  }).on('error', (error) => {
    console.error('MongoStore error:', error);
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000,
  },
}));

// Middleware for flash messages
app.use(flash());

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Passport setup (must come after session and before routes)
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(passport.initialize());
app.use(passport.session());

// Pass flash messages and user data to all views
app.use((req, res, next) => {
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.isAdmin = req.user && req.user.isAdmin;
  res.locals.currentUser = req.user;
  res.locals.error_msg = req.flash('error_msg');
  res.locals.success_msg = req.flash('success_msg');
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/cart', cartRoutes);
app.use('/admin', adminRouter);

// Home page route
app.get('/home', isLoggedIn, async (req, res) => {
  try {
    const products = await Product.find();
    const success = req.flash('success_msg')[0] || null;
    const error = req.flash('error_msg')[0] || null;

    let cartItems = 0;
    if (req.user) {
      const cart = await Cart.findOne({ userId: req.user._id });
      cartItems = cart ? cart.products.length : 0;
    }

    res.render('home', { 
      products,
      cartItems,
      user: req.user,
      isAuthenticated: req.isAuthenticated(),
      success,
      error
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    req.flash('error_msg', 'Server Error');
    res.status(500).redirect('/home');
  }
});

app.post('/track-order', async (req, res) => {
  const { orderId } = req.body;

  try {
      const order = await Order.findOne({ cloudOrderId: orderId }); 
      if (!order) {
          return res.status(404).json({ success: false, message: 'Order not found.' });
      }

      res.json({
          success: true,
          order: {
              cloudOrderId: order.cloudOrderId,
              status: order.status,
              estimatedDelivery: order.estimatedDelivery || 'N/A',
          },
      });
  } catch (error) {
      console.error('Track order error:', error);
      res.status(500).json({ success: false, message: 'Server error.' });
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
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .limit(3);
    const success = req.flash('success_msg')[0] || null;
    const error = req.flash('error_msg')[0] || null;
    res.render("index", { 
      cartItems, 
      isAuthenticated: req.isAuthenticated(),
      success,
      error,
      products
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    req.flash('error_msg', 'Server Error');
    res.status(500).redirect('/');
  }
});

// Get cart data
app.get('/cart/data', isLoggedIn, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    res.status(200).json(cart ? cart.products : []);
  } catch (err) {
    console.error('Error fetching cart data:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

app.get("/cart-count", isLoggedIn, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    const cartCount = cart ? cart.products.length : 0;
    res.json({ cartCount });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cart count" });
  }
});

app.get('/about', (req, res) => {
  const success = req.flash('success_msg')[0] || null;
  const error = req.flash('error_msg')[0] || null;
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

    const error = req.flash('error_msg')[0] || null;
    const success = req.flash('success_msg')[0] || null;

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

// Change Password Route
app.post('/profile/change-password', isLoggedIn, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  try {
    const user = req.user;
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/profile');
    }

    const isMatch = await user.authenticate(currentPassword).user !== false;
    if (!isMatch) {
      req.flash('error_msg', 'Current password is incorrect');
      return res.redirect('/profile');
    }

    if (newPassword !== confirmPassword) {
      req.flash('error_msg', 'New passwords do not match');
      return res.redirect('/profile');
    }

    if (newPassword.length < 6) {
      req.flash('error_msg', 'New password must be at least 6 characters');
      return res.redirect('/profile');
    }

    await new Promise((resolve, reject) => {
      user.setPassword(newPassword, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await user.save();
    req.flash('success_msg', 'Password changed successfully');
    res.redirect('/profile');
  } catch (err) {
    console.error('Server error in change-password route:', err);
    req.flash('error_msg', 'Server error');
    res.redirect('/profile');
  }
});

// 404 Error Handling
app.use((req, res, next) => {
  const success = req.flash('success_msg')[0] || null;
  const error = req.flash('error_msg')[0] || null;
  res.status(404).render('404', { 
    title: '404 - Not Found', 
    url: req.originalUrl,
    success,
    error
  });
});

// 500 Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  const success = req.flash('success_msg')[0] || null;
  const error = req.flash('error_msg')[0] || 'Server Error';
  res.status(500).render('500', { 
    title: '500 - Server Error', 
    error: err.message,
    success,
    error
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