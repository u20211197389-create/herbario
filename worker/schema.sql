-- Generado por scripts/export-d1.mjs
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  passwordHash TEXT NOT NULL, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  displayName TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS sessions (
  tokenHash TEXT PRIMARY KEY, userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expiresAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS specimens ("catalogNumber" TEXT PRIMARY KEY, "collectionNumber" TEXT, "identification" TEXT, "scientificName" TEXT, "authorship" TEXT, "rank" TEXT, "family" TEXT, "genus" TEXT, "habitat" TEXT, "habit" TEXT, "reproductiveCondition" TEXT, "country" TEXT, "department" TEXT, "municipality" TEXT, "locality" TEXT, "collectedAt" TEXT, "collectors" TEXT, "identifiedBy" TEXT, "originalLatitude" TEXT, "originalLongitude" TEXT, "minAltitude" TEXT, "maxAltitude" TEXT, "commonName" TEXT, "isType" INTEGER, "image" TEXT);
CREATE TABLE IF NOT EXISTS publications (id INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT, "url" TEXT, "description" TEXT, "image" TEXT);
CREATE TABLE IF NOT EXISTS library_items (id INTEGER PRIMARY KEY AUTOINCREMENT, "title" TEXT, "author" TEXT, "publisher" TEXT, "year" TEXT, "edition" TEXT, "format" TEXT, "location" TEXT, "status" TEXT, "language" TEXT, "contributors" TEXT, "subjects" TEXT, "available" TEXT);
CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, "role" TEXT, "name" TEXT, "functionText" TEXT, "photo" TEXT, "position" INTEGER);
CREATE TABLE IF NOT EXISTS image_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, catalogNumber TEXT NOT NULL, email TEXT NOT NULL, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente', token TEXT, expiresAt INTEGER,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decidedAt TEXT, kind TEXT NOT NULL DEFAULT 'imagen');
CREATE TABLE IF NOT EXISTS uploads (name TEXT PRIMARY KEY, type TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS upload_chunks (name TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (name, idx));
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resetAt INTEGER NOT NULL);
