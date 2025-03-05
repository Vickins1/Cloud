const express = require('express');
const passport = require('passport');
const User = require('../models/user');
const router = express.Router();
const crypto = require('crypto');
const emailService = require('../services/emailService');

// Render login page
router.get('/login', (req, res) => {
  const error = req.query.error || (req.flash('error_msg').length > 0 ? req.flash('error_msg')[0] : null);
  const success = req.flash('success_msg').length > 0 ? req.flash('success_msg')[0] : null;
  res.render('login', { error, success });
});

// Render signup page
router.get('/signup', (req, res) => {
  const error = req.query.error || (req.flash('error_msg').length > 0 ? req.flash('error_msg')[0] : null);
  res.render('signup', { error });
});

// Handle user sign-up
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Validate input
    if (!username || !email || !password) {
      return res.render('error', { message: 'All fields (username, email, password) are required.' });
    }

    // Additional validation
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      return res.render('error', { message: 'Please provide a valid email address.' });
    }
    if (password.length < 6) {
      return res.render('error', { message: 'Password must be at least 6 characters long.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.render('error', { message: 'Username or email already in use.' });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(20).toString('hex');

    // Create and register new user
    const newUser = new User({
      username,
      email,
      verificationToken,
    });
    await User.register(newUser, password);

    // Send verification email
    await emailService.sendVerificationEmail(req, {
      userName: username,
      userEmail: email,
      verificationToken
    });
    
    req.flash('success', 'Registration successful! Please check your email to verify your account.');
    return res.redirect('/auth/login');
    

  } catch (error) {
    console.error('Signup error:', error);
    let errorMessage = 'An error occurred during sign-up.';

    if (error.name === 'UserExistsError') {
      errorMessage = 'A user with this username or email already exists.';
    } else if (error.name === 'ValidationError') {
      errorMessage = Object.values(error.errors).map(err => err.message).join(', ');
    } else if (error.code === 11000) {
      errorMessage = 'Username or email already in use.';
    }

    return res.render('error', { message: errorMessage });
  }
});

// Handle user login
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
      if (err) {
          console.error('Login error:', err);
          req.flash('error_msg', 'An unexpected error occurred during login. Please try again.');
          return res.redirect('/auth/login');
      }
      if (!user) {
          req.flash('error_msg', 'Invalid username or password.');
          return res.redirect('/auth/login');
      }

      req.logIn(user, (err) => {
          if (err) {
              console.error('Login error:', err);
              req.flash('error_msg', 'An unexpected error occurred during login. Please try again.');
              return res.redirect('/auth/login');
          }

          // Success login
          req.flash('success_msg', `Welcome back, ${user.username}! You’re now logged in.`);
          const redirectTo = user.isAdmin ? '/admin/dashboard' : '/home';
          res.redirect(redirectTo);
      });
  })(req, res, next);
});

// Handle user logout
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return next(err);
    }
    res.redirect('/');
  });
});

// Forgot Password Route (GET) - Render form
router.get('/forgot-password', (req, res) => {
  const success = req.flash('success_msg').length > 0 ? req.flash('success_msg')[0] : null;
  const error = req.flash('error_msg').length > 0 ? req.flash('error_msg')[0] : null;
  res.render('forgot-password', { 
    title: 'Forgot Password', 
    success, 
    error 
  });
});

// Forgot Password Route (POST) - Send reset email
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error_msg', 'No account with that email address exists.');
      return res.redirect('/auth/forgot-password');
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = `http://${req.headers.host}/auth/reset-password/${resetToken}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Password Reset Request',
      text: `You are receiving this because you (or someone else) requested a password reset for your account.\n\n
             Please click the following link to reset your password:\n\n
             ${resetUrl}\n\n
             If you did not request this, please ignore this email and your password will remain unchanged.`
    };

    await transporter.sendMail(mailOptions);
    req.flash('success_msg', 'A password reset link has been sent to your email.');
    res.redirect('/auth/forgot-password');
  } catch (err) {
    console.error('Error in forgot-password route:', err);
    req.flash('error_msg', 'An error occurred while sending the reset email.');
    res.redirect('/auth/forgot-password');
  }
});

// Reset Password Route (GET) - Render reset form
router.get('/reset-password/:token', async (req, res) => {
  try {
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      req.flash('error_msg', 'Password reset token is invalid or has expired.');
      return res.redirect('/auth/forgot-password');
    }

    const success = req.flash('success_msg').length > 0 ? req.flash('success_msg')[0] : null;
    const error = req.flash('error_msg').length > 0 ? req.flash('error_msg')[0] : null;
    res.render('reset-password', { 
      title: 'Reset Password', 
      token: req.params.token, 
      success, 
      error 
    });
  } catch (err) {
    console.error('Error in reset-password GET route:', err);
    req.flash('error_msg', 'Server error');
    res.redirect('/auth/forgot-password');
  }
});

// Reset Password Route (POST) - Update password
router.post('/reset-password/:token', async (req, res) => {
  const { newPassword, confirmPassword } = req.body;

  try {
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      req.flash('error_msg', 'Password reset token is invalid or has expired.');
      return res.redirect('/auth/forgot-password');
    }

    if (newPassword !== confirmPassword) {
      req.flash('error_msg', 'Passwords do not match.');
      return res.redirect(`/auth/reset-password/${req.params.token}`);
    }

    if (newPassword.length < 6) {
      req.flash('error_msg', 'Password must be at least 6 characters.');
      return res.redirect(`/auth/reset-password/${req.params.token}`);
    }

    await new Promise((resolve, reject) => {
      user.setPassword(newPassword, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    req.flash('success_msg', 'Password has been reset successfully. Please log in.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error('Error in reset-password POST route:', err);
    req.flash('error_msg', 'Server error');
    res.redirect(`/auth/reset-password/${req.params.token}`);
  }
});

module.exports = router;