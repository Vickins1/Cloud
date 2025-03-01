const express = require('express');
const passport = require('passport');
const User = require('../models/user');
const router = express.Router();

// Render login page
router.get('/login', (req, res) => {
    res.render('login', { error: req.query.error });
});

// Render signup page
router.get('/signup', (req, res) => {
    res.render('signup', { error: req.query.error });
});

// Handle user sign-up
router.post('/signup', async (req, res) => {
    try {
        const newUser = new User({ username: req.body.username, email: req.body.email });
        User.register(newUser, req.body.password, (err, user) => {
            if (err) {
                // Redirect to signup page with error message
                return res.redirect('/auth/signup?error=' + encodeURIComponent(err.message));
            }
            passport.authenticate('local')(req, res, () => {
                res.redirect('auth/login');
            });
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.redirect('/auth/signup?error=' + encodeURIComponent('An error occurred during sign-up.'));
    }
});

// Handle user login
router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Login error:', err);
            return res.redirect('/auth/login?error=' + encodeURIComponent('An error occurred during login.'));
        }
        if (!user) {
            return res.redirect('/auth/login?error=' + encodeURIComponent('Invalid username or password.'));
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                return res.redirect('/auth/login?error=' + encodeURIComponent('An error occurred during login.'));
            }
            res.redirect('/home');
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

module.exports = router;
