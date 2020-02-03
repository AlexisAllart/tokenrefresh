'use strict';

const PORT = 3000;
const SECRET = 'secureKey';
const TOKENTIME = '2h';

const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const expressJwt = require('express-jwt');
const http = require('http');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const Strategy = require('passport-local');

const db = require('./dbDummy');

const app = express();
const authenticate = expressJwt({
    secret: SECRET
});

// PASSPORT
passport.use(new Strategy(
    function(username, password, done) {
        db.user.authenticate(username, password, done);
    }
));

// FUNCTIONS
function serializeUser(req, res, next) {
    db.user.updateOrCreate(req.user, function (err, user) {
        if (err) {
            return next(err);
        }
        req.user = {
            id: user.id
        };
        next();
    });
}

function serializeClient (req, res , next) {
    if (req.query.permanent === 'true') {
        db.client.updateOrCreate({
            user: req.user
        }, function (err, client) {
            if (err) {
                return next(err);
            }
            req.user.clientId = client.id;
            next();
        });
    } else {
        next();
    }
}

function validateRefreshToken(req, res, next) {
    db.client.findUserOfToken(req.body, function(err, user) {
        if (err) {
            return next(err);
        }
        req.user = user;
        next();
    })
}

function rejectToken(req, res, next) {
    db.client.rejectToken(req.body, next);
}

function generateAccessToken(req, res, next) {
    req.token = req.token || {};
    req.token.accessToken = jwt.sign({
        id: req.user.id,
        clientId: req.user.clientId
    }, SECRET, {
        expiresIn: TOKENTIME
    });
    next();
}

function generateRefreshToken(req, res, next) {
    if (req.query.permanent === 'true') {
        req.token.refreshToken = req.user.clientId.toString() + '.' + crypto.randomBytes(40).toString('hex');
        db.client.storeToken({
            id: req.user.clientId,
            refreshToken: req.token.refreshToken
        }, next);
    } else {
        next();
    }
}

const respond = {
    auth: function(req, res) {
        res.status(200).json({
            user: req.user,
            token: req.token
        });
    },
    token: function(req, res) {
        res.status(201).json({
            token: req.token
        });
    },
    reject: function(req, res) {
        res.status(204).end();
    }
};

// SERVER
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());

app.get('/', function(req, res) {
    res.status(200).json({
        hello: 'world'
    });
});

app.post('/auth', passport.authenticate(
    'local', {
        session: false, // disable passports store because token based authentication doesn't need session cookies
        scope: []
    }), serializeUser, serializeClient, generateAccessToken, generateRefreshToken, respond.auth);

app.get('/me', authenticate, function(req, res) {
    res.status(200).json(req.user);
})

app.post('/token', validateRefreshToken, generateAccessToken, respond.token);
app.post('/token/reject', rejectToken, respond.reject);

http.createServer(app).listen(PORT, function() {
    console.log('Server listening on port ' + PORT)
});