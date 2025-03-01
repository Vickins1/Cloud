const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/user');

// Configure Passport to use Local Strategy
passport.use(new LocalStrategy(User.authenticate()));

// Serialize user into session
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

module.exports = passport;
