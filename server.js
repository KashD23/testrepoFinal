const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./database');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const port = 3000;

// Middleware setup
app.use(cors());
app.use(bodyParser.json());

// Serve static files
app.use(express.static(__dirname));
app.use('/Resources', express.static(path.join(__dirname, 'Resources')));
app.use('/Images', express.static(path.join(__dirname, 'Images')));

// Serve `signin.html` directly from the current directory
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'signin.html'));
});

// User registration
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    db.get("SELECT * FROM users WHERE username = ?", [trimmedUsername], (err, row) => {
        if (err) return res.status(500).json({ error: "internal_error" });
        if (row) return res.status(200).json({ error: "username_exists" });

        bcrypt.hash(trimmedPassword, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: "internal_error" });
            db.run("INSERT INTO users (username, password) VALUES (?, ?)", [trimmedUsername, hash], function (err) {
                if (err) return res.status(500).json({ error: "internal_error" });
                res.status(200).json({ success: true });
            });
        });
    });
});

// User sign-in
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

// Fetch phishing emails
app.get('/phishing-emails', (req, res) => {
    db.all("SELECT * FROM reviewed_phishing_emails", [], (err, rows) => {
        if (err) return res.status(500).json({ error: "internal_error" });
        res.status(200).json(rows);
    });
});

// Fetch logs
app.get('/logs', (req, res) => {
    db.all("SELECT * FROM logs", [], (err, rows) => {
        if (err) return res.status(500).json({ error: "internal_error" });
        res.status(200).json(rows);
    });
});

// Report phishing email
app.post('/report-email', (req, res) => {
    const { from, subject, received, image } = req.body;
    if (!from || !subject || !received) return res.status(400).json({ error: "missing_fields" });

    db.run("INSERT INTO reviewed_phishing_emails (sender, subject, received, image) VALUES (?, ?, ?, ?)", [from, subject, received, image], function (err) {
        if (err) return res.status(500).json({ error: "internal_error" });
        db.run("DELETE FROM reported_emails WHERE sender = ? AND subject = ? AND received = ?", [from, subject, received]);
        res.status(200).json({ success: true });
    });
});

// Fetch training resources
app.get('/resources', (req, res) => {
    db.all("SELECT * FROM resources", [], (err, rows) => {
        if (err) return res.status(500).json({ error: "internal_error" });
        res.status(200).json(rows);
    });
});

// Generate and download reports
app.post('/generate-report', async (req, res) => {
    const { year, type } = req.body;

    // Validate input
    if (!year || !type) {
        return res.status(400).json({ error: "Missing year or type" });
    }

    let query = "";
    let params = [year];

    // Determine which data to fetch based on type
    if (type === "employee_activity") {
        query = "SELECT sender, subject, received FROM reviewed_phishing_emails WHERE strftime('%Y', received) = ?";
    } else if (type === "detection_logs") {
        query = "SELECT date, description, status FROM logs WHERE strftime('%Y', date) = ?";
    } else {
        return res.status(400).json({ error: "Invalid report type" });
    }

    db.all(query, params, async (err, rows) => {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).json({ error: "Database error" });
        }

        if (rows.length === 0) {
            return res.status(404).json({ error: "No data found for this report" });
        }

        // Create Excel workbook and sheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Report');

        // Add headers
        if (type === "employee_activity") {
            worksheet.addRow(["Sender", "Subject", "Received"]);
        } else if (type === "detection_logs") {
            worksheet.addRow(["Date", "Description", "Status"]);
        }

        // Add data rows
        rows.forEach(row => {
            if (type === "employee_activity") {
                worksheet.addRow([row.sender, row.subject, row.received]);
            } else if (type === "detection_logs") {
                worksheet.addRow([row.date, row.description, row.status]);
            }
        });

        // Generate file and send it
        try {
            const filePath = path.join(__dirname, `Report_${year}_${type.replace(/\s+/g, '_')}.xlsx`);
            await workbook.xlsx.writeFile(filePath);
            res.download(filePath, `Report_${year}_${type.replace(/\s+/g, '_')}.xlsx`, (err) => {
                if (err) {
                    console.error("Error sending file:", err);
                    res.status(500).json({ error: "Error sending file" });
                }
            });
        } catch (error) {
            console.error("Error generating Excel file:", error);
            res.status(500).json({ error: "Error generating Excel file" });
        }
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});