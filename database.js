const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const db = new sqlite3.Database("users.db");

// Create the users table
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (username TEXT, password TEXT)");

    const saltRounds = 10;

    const users = [
        { username: "user1", password: "password1" },
        { username: "user2", password: "password2" },
        { username: "admin", password: "adminpass" }
    ];

    // Function to hash a password and insert the user
    const insertUser = (user) => {
        return new Promise((resolve, reject) => {
            bcrypt.hash(user.password, saltRounds, (err, hashedPassword) => {
                if (err) {
                    reject(err);
                    return;
                }

                db.run(
                    "INSERT INTO users (username, password) VALUES (?, ?)",
                    [user.username, hashedPassword],
                    (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    }
                );
            });
        });
    };

    const insertAllUsers = async () => {
        for (const user of users) {
            try {
                await insertUser(user);
                console.log(`User ${user.username} inserted successfully.`);
            } catch (err) {
                console.error(`Error inserting user ${user.username}:`, err);
            }
        }
    };

    insertAllUsers();

    // Create the reported_emails table 
    db.run(`
        CREATE TABLE IF NOT EXISTS reported_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT,
            subject TEXT,
            received TEXT
        )
    `);

    // Create the reviewed_phishing_emails table 
    db.run(`
        CREATE TABLE IF NOT EXISTS reviewed_phishing_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT,
            subject TEXT,
            received TEXT,
            image TEXT  // Added column for image paths
        )
    `);

    // Create the logs table
    db.run(`
        CREATE TABLE IF NOT EXISTS logs (
            log_id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            description TEXT,
            status TEXT
        )
    `);

    // Create the resources table
    db.run(`
        CREATE TABLE IF NOT EXISTS resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_name TEXT,
            category TEXT,
            website_link TEXT,
            published TEXT
        )
    `);

    // Function to insert email data with duplicate check
    const insertEmail = (email) => {
        const { sender, subject, received } = email;

        db.get("SELECT * FROM reported_emails WHERE subject = ? AND sender = ? AND received = ?", [subject, sender, received], (err, row) => {
            if (err) {
                console.error("Error checking for duplicate:", err);
                return;
            }

            if (row) {
                console.log("Duplicate email detected. Skipping insert.");
            } else {
                const query = "INSERT INTO reported_emails (sender, subject, received) VALUES (?, ?, ?)";
                db.run(query, [sender, subject, received], (err) => {
                    if (err) {
                        console.error("Error inserting email:", err);
                    } else {
                        console.log(`Email from ${sender} inserted successfully.`);
                    }
                });
            }
        });
    };

    // Function to insert reviewed phishing emails
    const insertReviewedEmail = (email) => {
        const { sender, subject, received } = email;

        db.get("SELECT * FROM reviewed_phishing_emails WHERE subject = ? AND sender = ? AND received = ?", [subject, sender, received], (err, row) => {
            if (err) {
                console.error("Error checking for duplicate:", err);
                return;
            }

            if (row) {
                console.log("Duplicate reviewed email detected. Skipping insert.");
            } else {
                const query = "INSERT INTO reviewed_phishing_emails (sender, subject, received) VALUES (?, ?, ?)";
                db.run(query, [sender, subject, received], (err) => {
                    if (err) {
                        console.error("Error inserting reviewed email:", err);
                    } else {
                        console.log(`Reviewed email from ${sender} inserted successfully.`);
                    }
                });
            }
        });
    };

    // Function to insert training resources with duplicate check
    const insertResource = (resource) => {
        const { resource_name, category, website_link, published } = resource;

        db.get("SELECT * FROM resources WHERE resource_name = ? AND website_link = ?", [resource_name, website_link], (err, row) => {
            if (err) {
                console.error("Error checking for duplicate:", err);
                return;
            }

            if (row) {
                console.log("Duplicate resource detected. Skipping insert.");
            } else {
                const query = "INSERT INTO resources (resource_name, category, website_link, published) VALUES (?, ?, ?, ?)";
                db.run(query, [resource_name, category, website_link, published], (err) => {
                    if (err) {
                        console.error("Error inserting resource:", err);
                    } else {
                        console.log(`Resource ${resource_name} inserted successfully.`);
                    }
                });
            }
        });
    };

    const regularEmails = [
        { sender: "John Doe", subject: "Meeting Tomorrow", received: "2025-01-01 9:00 AM" },
        { sender: "Jane Smith", subject: "Project Update", received: "2025-01-01 10:15 AM" },
        { sender: "Michael Johnson", subject: "Invoice #12345", received: "2025-01-02 3:00 PM" }
    ];

    const reviewedEmails = [
        { sender: "phisher@example.com", subject: "Urgent: Verify Your Account", received: "2023-10-01" },
        { sender: "scam@example.com", subject: "You’ve Won a Prize!", received: "2023-10-02" }
    ];

    const trainingResources = [
        { resource_name: "Reporting Phishing Emails to IT", category: "Training", website_link: "http://localhost:3000/Resources/reporting-phishing-emails-to-it.pdf", published: "2023-10-01" },
        { resource_name: "Securing your Passwords", category: "Training", website_link: "http://localhost:3000/Resources/securing-your-passwords.pdf", published: "2023-10-01" },
        { resource_name: "Email Security Video", category: "Training", website_link: "http://localhost:3000/Resources/email-security.mp4", published: "2023-10-02" },
        { resource_name: "Phishing Infographic", category: "Training", website_link: "http://localhost:3000/Resources/infographic.png", published: "2023-10-03" }
    ];

    regularEmails.forEach(insertEmail);
    reviewedEmails.forEach(insertReviewedEmail);
    trainingResources.forEach(insertResource);
});

// Export the database object
module.exports = db;