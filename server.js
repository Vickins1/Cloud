require('dotenv').config();
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
const cartRoutes = require('./routes/cart');
const Order = require('./models/order');
const fs = require('fs').promises;
const multer = require('multer');
const adminRouter = require('./routes/admin');
const supportRoutes = require('./routes/support');
const Cart = require('./models/cart');
const nodemailer = require('nodemailer');
require('./config/passport');
const os = require('os');

// Load environment variables
require('dotenv').config();

const app = express();
app.set('view engine', 'ejs');
app.set('trust proxy', 1);

// Validate environment variables
const requiredEnvVars = ['MONGODB_URI', 'SESSION_SECRET', 'EMAIL_USER', 'EMAIL_PASS'];
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Error: Environment variable ${varName} is not set`);
    process.exit(1);
  }
});

// MongoDB connection
const uri = process.env.MONGODB_URI;

async function connectToDatabase() {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });
    console.log('Connected to MongoDB!');
    // Start server
    const port = process.env.PORT || 4200;
    app.listen(port, '0.0.0.0', () => {
      const localIP = getLocalIP();
      console.log(`Cloud 420 is running at:
        - Local: http://localhost:${port}
        - Network: http://${localIP}:${port}`);
    });
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
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

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10,
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

app.use(
  session({
    secret: process.env.SESSION_SECRET,
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
  })
);

app.use(flash());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(passport.initialize());
app.use(passport.session());

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
app.use('/support', supportRoutes);

const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth');
};

app.get('/home', isLoggedIn, async (req, res) => {
  try {
    const [products, cart, user, recentOrders] = await Promise.all([
      Product.find().lean(),
      Cart.findOne({ userId: req.user._id }).lean(),
      User.findById(req.user._id).lean(),
      Order.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .select('orderId createdAt status'),
    ]);

    const cartItems = cart ? cart.products.length : 0;
    const userName = user.name || user.username || 'Cloud Explorer';
    const userPoints = user.points || 0;

    const success = req.flash('success_msg')[0] || null;
    const error = req.flash('error_msg')[0] || null;

    res.render('home', {
      products,
      cartItems,
      userName,
      recentOrders,
      userPoints,
      isAuthenticated: true,
      success,
      error,
      user: req.user,
    });
  } catch (err) {
    console.error('Error in /home route:', err);
    req.flash('error_msg', 'Oops! Something went wrong on our end. Please try again.');
    res.status(500).redirect('/home');
  }
});

app.get('/', async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    let cartItems = 0;
    if (userId) {
      const cart = await Cart.findOne({ userId });
      cartItems = cart ? cart.products.length : 0;
    }
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .limit(4);
    const success = req.flash('success_msg')[0] || null;
    const error = req.flash('error_msg')[0] || null;
    res.render('index', {
      cartItems,
      isAuthenticated: req.isAuthenticated(),
      success,
      error,
      products,
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    req.flash('error_msg', 'Server Error');
    res.redirect('/');
  }
});

app.get('/cart/data', isLoggedIn, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    res.status(200).json(cart ? cart.products : []);
  } catch (err) {
    console.error('Error fetching cart data:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

app.get('/cart-count', isLoggedIn, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    const cartCount = cart ? cart.products.length : 0;
    res.json({ cartCount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cart count' });
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
    error,
  });
});

app.get('/terms', (req, res) => {
  res.render('terms', {
    cartItems: req.session.cart ? req.session.cart.length : 0,
  });
});

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
        email: user.email,
      },
      currentDate: new Date().toLocaleString(),
      isAuthenticated: true,
      cartItems: 0,
      error,
      success,
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server error');
    res.redirect('/auth/login');
  }
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
});

transporter.verify((error, success) => {
  if (error) {
    console.error('Nodemailer verification failed:', error);
  } else {
    console.log('Nodemailer is ready to send emails');
  }
});

app.post('/contact', (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.redirect('/?success=false&message=All fields are required');
  }

  const mailOptions = {
    from: `Cloud 420 Store <${process.env.EMAIL_USER}>`,
    to: 'aj9589362@gmail.com',
    subject: `New Contact Form Submission from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.redirect('/?success=false&message=Failed to send message');
    }
    console.log('Email sent:', info.response);
    res.redirect('/?success=true&message=Message sent successfully!');
  });
});

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

app.use((req, res, next) => {
  const success = req.flash('success_msg')[0] || null;
  const error = req.flash('error_msg')[0] || null;
  res.status(404).render('404', {
    title: '404 - Not Found',
    url: req.originalUrl,
    success,
    error,
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  const success = req.flash('success_msg')[0] || null;
  const error = req.flash('error_msg')[0] || 'Server Error';
  res.status(500).render('500', {
    title: '500 - Server Error',
    error: err.message,
    success,
    error,
  });
});

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