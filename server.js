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
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// =============================================
// Static Files Configuration
// =============================================
app.use(express.static(path.join(__dirname, 'public')));
app.use('/resources', express.static(path.join(__dirname, 'public/resources')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// =============================================
// Database Initialization
// =============================================
const dbPath = process.env.NODE_ENV === 'production' 
  ? path.join('/tmp', 'database.db')
  : path.join(__dirname, 'database.db');

// =============================================
// API Routes
// =============================================

// Training Resources Endpoint
app.get('/api/resources', (req, res) => {
  try {
    // In production, you would query these from a database
    const resources = [
      {
        id: 1,
        name: "Phishing Awareness Video",
        category: "Video Training",
        type: "video",
        filename: "phishing-awareness.mp4",
        description: "Learn how to identify phishing attempts",
        published: "2023-01-15"
      },
      {
        id: 2,
        name: "Security Best Practices",
        category: "Document",
        type: "pdf",
        filename: "security-best-practices.pdf",
        description: "Essential security practices for employees",
        published: "2023-02-20"
      },
      {
        id: 3,
        name: "Phishing Examples",
        category: "Image Gallery",
        type: "image",
        filename: "phishing-examples.jpg",
        description: "Real-world phishing email examples",
        published: "2023-03-10"
      }
    ];

    // Verify resources actually exist in the filesystem
    const verifiedResources = resources.filter(resource => {
      const filePath = path.join(__dirname, 'public/resources', resource.filename);
      return fs.existsSync(filePath);
    });

    res.json(verifiedResources);
  } catch (error) {
    console.error("Error loading resources:", error);
    res.status(500).json({ error: "Failed to load resources" });
  }
});

// Serve signin.html as homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signin.html'));
});

// User Registration
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  db.get("SELECT * FROM users WHERE username = ?", [trimmedUsername], (err, row) => {
    if (err) return res.status(500).json({ error: "internal_error" });
    if (row) return res.status(200).json({ error: "username_exists" });

    bcrypt.hash(trimmedPassword, 10, (err, hash) => {
      if (err) return res.status(500).json({ error: "internal_error" });
      db.run("INSERT INTO users (username, password) VALUES (?, ?)", 
        [trimmedUsername, hash], 
        function (err) {
          if (err) return res.status(500).json({ error: "internal_error" });
          res.status(200).json({ success: true });
        }
      );
    });
  });
});

// User Sign-In
app.post('/signin', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username.trim()], (err, row) => {
    if (err) return res.status(500).json({ error: "internal_error" });
    if (!row) return res.status(200).json({ error: "invalid_user" });

    bcrypt.compare(password.trim(), row.password, (err, isMatch) => {
      if (err) return res.status(500).json({ error: "internal_error" });
      if (!isMatch) return res.status(200).json({ error: "invalid_password" });
      res.status(200).json({ success: true });
    });
  });
});

// Phishing Email Endpoints
app.get('/phishing-emails', (req, res) => {
  db.all("SELECT * FROM reviewed_phishing_emails", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "internal_error" });
    res.status(200).json(rows);
  });
});

app.post('/report-email', (req, res) => {
  const { from, subject, received, image } = req.body;
  if (!from || !subject || !received) return res.status(400).json({ error: "missing_fields" });

  db.run(
    "INSERT INTO reviewed_phishing_emails (sender, subject, received, image) VALUES (?, ?, ?, ?)", 
    [from, subject, received, image], 
    function (err) {
      if (err) return res.status(500).json({ error: "internal_error" });
      res.status(200).json({ success: true });
    }
  );
});

// Log Endpoints
app.get('/logs', (req, res) => {
  db.all("SELECT * FROM logs", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "internal_error" });
    res.status(200).json(rows);
  });
});

// Report Generation
app.post('/generate-report', async (req, res) => {
  const { year, type } = req.body;

  if (!year || !type) {
    return res.status(400).json({ error: "Missing year or type" });
  }

  let query = "";
  let params = [year];

  if (type === "employee_activity") {
    query = "SELECT sender, subject, received FROM reviewed_phishing_emails WHERE strftime('%Y', received) = ?";
  } else if (type === "detection_logs") {
    query = "SELECT date, description, status FROM logs WHERE strftime('%Y', date) = ?";
  } else {
    return res.status(400).json({ error: "Invalid report type" });
  }

  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: "No data found" });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Add headers and data
    if (type === "employee_activity") {
      worksheet.addRow(["Sender", "Subject", "Received"]);
      rows.forEach(row => worksheet.addRow([row.sender, row.subject, row.received]));
    } else {
      worksheet.addRow(["Date", "Description", "Status"]);
      rows.forEach(row => worksheet.addRow([row.date, row.description, row.status]));
    }

    const fileName = `Report_${year}_${type.replace(/\s+/g, '_')}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error("Report generation failed:", error);
    res.status(500).json({ error: "Report generation failed" });
  }
});

// =============================================
// Server Startup
// =============================================
app.listen(PORT, () => {
  console.log(`
  Server running on port ${PORT}
  Local: http://localhost:${PORT}
  Render: https://testrepofinal.onrender.com
  `);
  
  // Create resources directory if it doesn't exist
  const resourcesDir = path.join(__dirname, 'public/resources');
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
    console.log('Created resources directory');
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});