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
// API Endpoints
// =============================================

// Signin Endpoint (Enhanced)
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

// Reports Endpoint (Fixed)
app.get('/phishing-emails', (req, res) => {
  db.all(`
    SELECT 
      id, 
      sender, 
      subject, 
      strftime('%Y-%m-%d %H:%M', received) as formatted_date
    FROM reviewed_phishing_emails 
    ORDER BY received DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('REPORTS ERROR:', err);
      return res.status(500).json({ 
        error: "Failed to load reports",
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    res.json(rows || []);
  });
});

// Logs Endpoint (Fixed)
app.get('/logs', (req, res) => {
  db.all(`
    SELECT 
      log_id as id,
      strftime('%Y-%m-%d %H:%M', datetime(date, 'localtime')) as date,
      description,
      status
    FROM logs
    ORDER BY date DESC
    LIMIT 100
  `, [], (err, rows) => {
    if (err) {
      console.error('LOGS ERROR:', err);
      return res.status(500).json({
        error: "Failed to load logs",
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    res.json(rows || []);
  });
});

// Resources Endpoint (Existing)
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
      console.error("RESOURCES ERROR:", err);
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

// Report Generation (Existing)
app.post('/generate-report', async (req, res) => {
  /* ... your existing report generation code ... */
});

// =============================================
// Server Startup
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

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err);
  res.status(500).json({ 
    error: "Internal server error",
    requestId: req.id
  });
});

process.on('uncaughtException', (err) => {
  console.error('CRITICAL ERROR:', err);
  process.exit(1);
});