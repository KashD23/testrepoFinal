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

// Middleware Configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Static Files Configuration
app.use(express.static(path.join(__dirname, 'public')));
app.use('/resources', express.static(path.join(__dirname, 'public', 'resources'), {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath);
    switch (ext) {
      case '.pdf':
        res.setHeader('Content-Type', 'application/pdf');
        break;
      case '.mp4':
        res.setHeader('Content-Type', 'video/mp4');
        break;
      case '.png':
        res.setHeader('Content-Type', 'image/png');
        break;
      case '.jpg':
      case '.jpeg':
        res.setHeader('Content-Type', 'image/jpeg');
        break;
    }
  }
}));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// API Routes
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

// Serve signin.html as homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signin.html'));
});

// [Keep all your other existing routes unchanged...]

// Server Startup
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