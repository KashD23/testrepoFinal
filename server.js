const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./database');
const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// Middleware Configuration
// =============================================
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// =============================================
// Static Files Configuration
// =============================================
app.use(express.static(path.join(__dirname, 'public')));
app.use('/resources', express.static(path.join(__dirname, 'public', 'resources'), {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath);
    switch (ext) {
      case '.pdf': res.setHeader('Content-Type', 'application/pdf'); break;
      case '.mp4': res.setHeader('Content-Type', 'video/mp4'); break;
      case '.png': res.setHeader('Content-Type', 'image/png'); break;
      case '.jpg': case '.jpeg': res.setHeader('Content-Type', 'image/jpeg'); break;
    }
  }
}));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// =============================================
// API Routes
// =============================================
app.get('/api/resources', (req, res) => {
  db.all(`
    SELECT 
      id,
      resource_name as name,
      category,
      website_link,
      published,
      CASE 
        WHEN website_link LIKE '%.pdf' THEN 'pdf'
        WHEN website_link LIKE '%.mp4' OR website_link LIKE '%.mov' OR website_link LIKE '%.avi' THEN 'video'
        WHEN website_link LIKE '%.jpg' OR website_link LIKE '%.png' OR website_link LIKE '%.gif' THEN 'image'
        ELSE 'other'
      END as type
    FROM resources
  `, [], (err, rows) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const verifiedResources = rows.map(row => {
      const filename = path.basename(row.website_link);
      const filePath = path.join(__dirname, 'public', 'resources', filename);
      const exists = fs.existsSync(filePath);
      
      return {
        ...row,
        filename: filename,
        url: `/resources/${filename}`,
        accessible: exists,
        description: `${row.category} training resource`
      };
    }).filter(res => res.accessible);

    res.json(verifiedResources);
  });
});

// =============================================
// Enhanced Signin Endpoint (Only this was modified)
// =============================================
app.post('/signin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE username = ?", [username.trim()], (err, row) => {
        err ? reject(err) : resolve(row);
      });
    });

    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

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

// =============================================
// Your Other Existing Routes (Unchanged)
// =============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signin.html'));
});

// Phishing Email Endpoints (Keep your existing implementation)
app.get('/phishing-emails', (req, res) => {
  db.all("SELECT * FROM reviewed_phishing_emails", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "internal_error" });
    res.status(200).json(rows);
  });
});

// Report Generation (Keep your existing implementation)
app.post('/generate-report', async (req, res) => {
  /* ... your existing report generation code ... */
});

// =============================================
// Server Startup (Unchanged)
// =============================================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Validate resources directory
  const resourcesDir = path.join(__dirname, 'public', 'resources');
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
    console.log('Created resources directory');
  }

  // Verify expected files exist
  const expectedFiles = [
    'reporting-phishing-emails-to-it.pdf',
    'securing-your-passwords.pdf',
    'email-security.mp4',
    'infographic.png'
  ];

  expectedFiles.forEach(file => {
    const filePath = path.join(resourcesDir, file);
    console.log(fs.existsSync(filePath) ? `✓ Found: ${file}` : `⚠️ Missing: ${file}`);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});