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
      req.flash('error_msg', 'All fields (username, email, password) are required.');
      return res.redirect('/auth/signup');
    }

    // Additional validation
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      req.flash('error_msg', 'Please provide a valid email address.');
      return res.redirect('/auth/signup');
    }
    if (password.length < 8) {
      req.flash('error_msg', 'Password must be at least 8 characters long.');
      return res.redirect('/auth/signup');
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      req.flash('error_msg', 'Username or email already in use.');
      return res.redirect('/auth/signup');
    }

    // Generate verification code (6-character code instead of token)
    const verificationCode = crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g., "A1B2C3"

    // Create new user
    const newUser = new User({
      username,
      email,
      verificationCode,
      verificationCodeExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      isVerified: false
    });

    // Register user with password (assuming passport-local-mongoose)
    await User.register(newUser, password);

    // Send verification email
    await emailService.sendEmailVerification({
      userName: username,
      userEmail: email,
      verificationCode,
      host: req.headers.host
    });

    req.flash('success_msg', 'Registration successful! Please check your email/spam for your verification code.');
    return res.redirect('/auth/verify');

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

    req.flash('error_msg', errorMessage);
    return res.redirect('/auth/signup');
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

// Verification Page (GET)
router.get('/verify', (req, res) => {
  const success = req.flash('success_msg')[0] || null;
  const error = req.flash('error_msg')[0] || null;
  res.render('verify', { 
      title: 'Verify Email | Cloud 420',
      success,
      error
  });
});

// Verification Submission
router.post('/verify', async (req, res) => {
  const { code } = req.body;

  try {
      const user = await User.findOne({
          verificationCode: code,
          verificationCodeExpires: { $gt: Date.now() }
      });

      if (!user) {
          req.flash('error_msg', 'Invalid or expired verification code.');
          return res.redirect('/auth/verify');
      }

      user.isVerified = true;
      user.verificationCode = undefined;
      user.verificationCodeExpires = undefined;
      await user.save();

      req.flash('success_msg', 'Email verified successfully! Please log in.');
      res.redirect('/auth/login');
  } catch (err) {
      console.error('Error in verification:', err);
      req.flash('error_msg', 'Verification failed. Please try again.');
      res.redirect('/auth/verify');
  }
});


// Forgot Password Route (POST) - Handle modal form submission
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error_msg', 'No account with that email exists.');
      return res.redirect('/auth/login');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    await emailService.sendPasswordResetEmail({
      userName: user.name || 'Cloud 420 User',
      userEmail: email,
      resetToken,
      host: req.headers.host
    });

    req.flash('success_msg', 'A password reset link has been sent to your email/spam.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error('Error in forgot-password route:', err);
    req.flash('error_msg', 'Failed to send reset email. Please try again.');
    res.redirect('/auth/login');
  }
});

router.get('/reset-password/:token', async (req, res) => {
  try {
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      req.flash('error_msg', 'Password reset link is invalid or has expired.');
      return res.redirect('/auth/login');
    }

    const success = req.flash('success_msg')[0] || null;
    const error = req.flash('error_msg')[0] || null;
    
    res.render('reset-password', { 
      title: 'Reset Password | Cloud 420',
      token: req.params.token,
      success,
      error
    });
  } catch (err) {
    console.error('Error in reset-password GET route:', err);
    req.flash('error_msg', 'Something went wrong. Please try again.');
    res.redirect('/auth/login');
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
      req.flash('error_msg', 'Password reset link is invalid or has expired.');
      return res.redirect('/auth/login');
    }

    // Password validation
    if (!newPassword || !confirmPassword) {
      req.flash('error_msg', 'Please fill in both password fields.');
      return res.redirect(`/auth/reset-password/${req.params.token}`);
    }

    if (newPassword !== confirmPassword) {
      req.flash('error_msg', 'Passwords do not match.');
      return res.redirect(`/auth/reset-password/${req.params.token}`);
    }

    if (newPassword.length < 8) {
      req.flash('error_msg', 'Password must be at least 8 characters long.');
      return res.redirect(`/auth/reset-password/${req.params.token}`);
    }

    // Assuming User model uses passport-local-mongoose or similar
    await new Promise((resolve, reject) => {
      user.setPassword(newPassword, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Clear reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    req.flash('success_msg', 'Password reset successful! Please log in with your new password.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error('Error in reset-password POST route:', err);
    req.flash('error_msg', 'Failed to reset password. Please try again.');
    res.redirect(`/auth/reset-password/${req.params.token}`);
  }
});

module.exports = router;