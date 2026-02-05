import { createClient } from "@libsql/client";
import { randomBytes } from "crypto";

// Initialize Turso client
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize tables
const initDb = async () => {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      device_id TEXT,
      title TEXT DEFAULT 'New conversation',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS anonymous_counts (
      ip TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

// Run init on module load
const dbReady = initDb();

// Helper to ensure db is ready
async function ready() {
  await dbReady;
}

// Generate 6-digit code
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate session token
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// Create or get user, create verification code
export async function createVerificationCode(email: string): Promise<string> {
  await ready();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.execute({ sql: "INSERT OR IGNORE INTO users (email) VALUES (?)", args: [email] });
  await db.execute({ sql: "INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)", args: [email, code, expiresAt] });

  return code;
}

// Verify code and create session
export async function verifyCodeAndCreateSession(email: string, code: string): Promise<string | null> {
  await ready();
  const result = await db.execute({
    sql: `SELECT id FROM verification_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`,
    args: [email, code],
  });

  if (result.rows.length === 0) return null;
  const codeId = result.rows[0].id as number;

  await db.execute({ sql: "UPDATE verification_codes SET used = 1 WHERE id = ?", args: [codeId] });
  await db.execute({ sql: "UPDATE users SET verified = 1 WHERE email = ?", args: [email] });

  const userResult = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
  const userId = userResult.rows[0].id as number;

  const token = generateToken();
  await db.execute({ sql: "INSERT INTO sessions (user_id, token) VALUES (?, ?)", args: [userId, token] });

  return token;
}

// Get user from session token
export async function getUserFromToken(token: string): Promise<{ id: number; email: string } | null> {
  await ready();
  const result = await db.execute({
    sql: `SELECT users.id, users.email FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.token = ?`,
    args: [token],
  });

  if (result.rows.length === 0) return null;
  return { id: result.rows[0].id as number, email: result.rows[0].email as string };
}

// Create a new conversation (supports both user_id and device_id)
export async function createConversation(opts: { userId?: number; deviceId?: string }, title?: string): Promise<number> {
  await ready();
  const result = await db.execute({
    sql: "INSERT INTO conversations (user_id, device_id, title) VALUES (?, ?, ?)",
    args: [opts.userId || null, opts.deviceId || null, title || "New conversation"],
  });
  return Number(result.lastInsertRowid);
}

// Get conversations by user_id or device_id
export async function getConversations(opts: { userId?: number; deviceId?: string }): Promise<{ id: number; title: string; created_at: string }[]> {
  await ready();
  const sql = opts.userId
    ? "SELECT id, title, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC"
    : "SELECT id, title, created_at FROM conversations WHERE device_id = ? ORDER BY created_at DESC";
  const result = await db.execute({ sql, args: [opts.userId || opts.deviceId] });
  return result.rows.map((r) => ({ id: r.id as number, title: r.title as string, created_at: r.created_at as string }));
}

// Update conversation title
export async function updateConversationTitle(conversationId: number, title: string) {
  await ready();
  const shortTitle = title.slice(0, 50) + (title.length > 50 ? "..." : "");
  await db.execute({ sql: "UPDATE conversations SET title = ? WHERE id = ?", args: [shortTitle, conversationId] });
}

// Save chat message
export async function saveMessage(conversationId: number, role: "user" | "assistant", content: string) {
  await ready();
  await db.execute({
    sql: "INSERT INTO chats (conversation_id, role, content) VALUES (?, ?, ?)",
    args: [conversationId, role, content],
  });

  // Update title from first user message
  if (role === "user") {
    const countResult = await db.execute({
      sql: "SELECT COUNT(*) as c FROM chats WHERE conversation_id = ? AND role = 'user'",
      args: [conversationId],
    });
    if ((countResult.rows[0].c as number) === 1) {
      await updateConversationTitle(conversationId, content);
    }
  }
}

// Get chat history for a conversation
export async function getChatHistory(conversationId: number): Promise<{ role: string; content: string }[]> {
  await ready();
  const result = await db.execute({
    sql: "SELECT role, content FROM chats WHERE conversation_id = ? ORDER BY id ASC",
    args: [conversationId],
  });
  return result.rows.map((r) => ({ role: r.role as string, content: r.content as string }));
}

// Delete a conversation
export async function deleteConversation(conversationId: number) {
  await ready();
  await db.execute({ sql: "DELETE FROM chats WHERE conversation_id = ?", args: [conversationId] });
  await db.execute({ sql: "DELETE FROM conversations WHERE id = ?", args: [conversationId] });
}

// Migrate anonymous conversations to user account
export async function migrateConversationsToUser(deviceId: string, userId: number) {
  await ready();
  await db.execute({
    sql: "UPDATE conversations SET user_id = ?, device_id = NULL WHERE device_id = ?",
    args: [userId, deviceId],
  });
}

// Get anonymous message count by IP
export async function getAnonCount(ip: string): Promise<number> {
  await ready();
  const result = await db.execute({ sql: "SELECT count FROM anonymous_counts WHERE ip = ?", args: [ip] });
  return result.rows.length > 0 ? (result.rows[0].count as number) : 0;
}

// Increment anonymous message count
export async function incrementAnonCount(ip: string): Promise<number> {
  await ready();
  await db.execute({
    sql: `INSERT INTO anonymous_counts (ip, count, updated_at) VALUES (?, 1, CURRENT_TIMESTAMP) ON CONFLICT(ip) DO UPDATE SET count = count + 1, updated_at = CURRENT_TIMESTAMP`,
    args: [ip],
  });
  return getAnonCount(ip);
}

export default db;
