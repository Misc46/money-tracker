const { createClient } = require("@libsql/client");
const fs = require("fs");
const path = require("path");

// Manually parse .env.local
const envPath = path.join(__dirname, ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach(line => {
    const [key, value] = line.split("=");
    if (key && value) env[key.trim()] = value.trim();
});

const db = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
});

async function migrate() {
    console.log("Starting migration...");
    try {
        // 1. Rename existing table
        console.log("Renaming table...");
        await db.execute("ALTER TABLE transactions RENAME TO transactions_old");

        // 2. Create new table with updated CHECK constraint
        console.log("Creating new table...");
        await db.execute(`
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'saved')),
        reason TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

        // 3. Move data from old to new
        console.log("Moving data...");
        await db.execute(`
      INSERT INTO transactions (id, date, amount, type, reason, description, created_at)
      SELECT id, date, amount, type, reason, description, created_at FROM transactions_old
    `);

        // 4. Update the specific 'Savings' transaction
        console.log("Updating 'Savings' transaction to 'saved'...");
        await db.execute({
            sql: "UPDATE transactions SET type = 'saved' WHERE reason = 'Savings' AND amount = 800000",
            args: []
        });

        // 5. Drop the old table
        console.log("Dropping old table...");
        await db.execute("DROP TABLE transactions_old");

        console.log("Migration successful!");
    } catch (err) {
        console.error("Migration failed:", err.message);
        // Attempt rollback if rename happened
        try {
            await db.execute("ALTER TABLE transactions_old RENAME TO transactions");
        } catch (e) { }
    }
    process.exit(0);
}

migrate();
