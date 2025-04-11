const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./database');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/resources', express.static(path.join(__dirname, 'public', 'resources')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// Signin endpoint (updated)
app.post('/signin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validation
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    // Database query
    const user = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE username = ?", [username.trim()], (err, row) => {
        err ? reject(err) : resolve(row);
      });
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Password comparison
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Success
    res.json({ 
      success: true,
      redirect: "/overview.html",
      username: user.username
    });

  } catch (err) {
    console.error('SIGNIN ERROR:', err);
    res.status(500).json({ error: "Server error during login" });
  }
});

// Other routes (keep your existing /api/resources, etc.)

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});