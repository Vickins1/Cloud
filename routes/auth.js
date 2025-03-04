const express = require('express');
const passport = require('passport');
const User = require('../models/user');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
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

      // Additional validation (optional)
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
          req.flash('error_msg', 'Please provide a valid email address.');
          return res.redirect('/auth/signup');
      }
      if (password.length < 6) {
          req.flash('error_msg', 'Password must be at least 6 characters long.');
          return res.redirect('/auth/signup');
      }

      // Check if user already exists (optional, since passport-local-mongoose handles this)
      const existingUser = await User.findOne({ $or: [{ username }, { email }] });
      if (existingUser) {
          req.flash('error_msg', 'Username or email already in use.');
          return res.redirect('/auth/signup');
      }

      // Generate verification token
      const verificationToken = crypto.randomBytes(20).toString('hex');

      // Create and register new user
      const newUser = new User({
          username,
          email,
          verificationToken,
          isVerified: false 
      });
      await User.register(newUser, password);

      // Send verification email
      await emailService.sendVerificationEmail({
          customerName: username,
          customerEmail: email,
          verificationToken
      });

      // Success message and redirect
      req.flash('success_msg', 'Registration successful! Please check your email to verify your account.');
      res.redirect('/auth/login');
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
      res.redirect('/auth/signup');
  }
});

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ message: 'Verification token is required' });
  }

  try {
    // Find user by verification token and check if it’s still valid
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }, // Ensure token hasn't expired
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    // Mark the user as verified
    user.isVerified = true;
    user.verificationToken = undefined; // Clear the token
    user.verificationTokenExpires = undefined; // Clear the expiration
    await user.save();

    // Optionally redirect to a success page or send a JSON response
    res.status(200).json({ message: 'Email verified successfully! You can now log in.' });
    // Alternatively, redirect to a frontend success page:
    // res.redirect('https://cloud420.store/verified-success');
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ message: 'Server error during email verification' });
  }
});

// Render verification page
router.get('/verify', (req, res) => {
  res.render('verify', {
      email: req.session.email || '',
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
  });
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;

  try {
      if (!email) {
          req.flash('error_msg', 'Please provide your email address.');
          return res.redirect('/auth/verify');
      }

      const user = await User.findOne({ email });
      if (!user) {
          req.flash('error_msg', 'No account found with this email.');
          return res.redirect('/auth/verify');
      }

      if (user.isVerified) {
          req.flash('error_msg', 'This email is already verified. Please log in.');
          return res.redirect('/auth/login');
      }

      // Generate a new verification token
      const verificationToken = crypto.randomBytes(20).toString('hex');
      user.verificationToken = verificationToken;
      await user.save();

      // Send verification email
      await emailService.sendVerificationEmail({
          customerName: user.username,
          customerEmail: user.email,
          verificationToken
      });

      req.session.email = email; // Store email in session for display
      req.flash('success_msg', 'Verification email resent successfully! Check your inbox.');
      res.redirect('/auth/verify');
  } catch (error) {
      console.error('Resend verification error:', error);
      req.flash('error_msg', 'Failed to resend verification email. Try again later.');
      res.redirect('/auth/verify');
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

          // Check if email is verified
          if (!user.isVerified) {
              req.logout((logoutErr) => {
                  if (logoutErr) console.error('Logout error:', logoutErr);
              });
              req.flash('error_msg', 'Please verify your email before logging in.');
              return res.redirect('/auth/verify');
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