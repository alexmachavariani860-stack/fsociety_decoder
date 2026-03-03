const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");

const io = new Server(
  server,
  CORS_ORIGIN
    ? {
        cors: {
          origin: CORS_ORIGIN.split(",").map((origin) => origin.trim()),
          methods: ["GET", "POST"],
        },
      }
    : undefined
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]\n");
  }

  if (!fs.existsSync(MESSAGES_FILE)) {
    fs.writeFileSync(MESSAGES_FILE, "[]\n");
  }
}

function readJson(filePath, fallbackValue) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.trim() ? JSON.parse(content) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getUsers() {
  return readJson(USERS_FILE, []);
}

function saveUsers(users) {
  writeJson(USERS_FILE, users);
}

function getMessages() {
  return readJson(MESSAGES_FILE, []);
}

function saveMessages(messages) {
  writeJson(MESSAGES_FILE, messages);
}

function issueSessionToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, phase: "session" },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function normalizeUsername(username) {
  return String(username || "").trim();
}

app.post("/api/register", async (req, res) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");

    if (username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const users = getUsers();
    const userExists = users.some(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );

    if (userExists) {
      return res.status(409).json({ error: "Username already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: Date.now().toString(36),
      username,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString(),
    };

    users.push(user);
    saveUsers(users);

    return res.status(201).json({ success: true });
  } catch {
    return res.status(500).json({ error: "Server storage error. Try again." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");

    const users = getUsers();
    const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    return res.json({
      success: true,
      sessionToken: issueSessionToken(user),
      username: user.username,
    });
  } catch {
    return res.status(500).json({ error: "Server storage error. Try again." });
  }
});

app.get("/api/messages", (req, res) => {
  try {
    const token = req.header("authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Session token required." });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.phase !== "session") {
      return res.status(401).json({ error: "Invalid session." });
    }

    const messages = getMessages();
    return res.json({ messages: messages.slice(-150) });
  } catch {
    return res.status(401).json({ error: "Session expired. Login again." });
  }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Session required."));
    }

    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.phase !== "session") {
      return next(new Error("Invalid session."));
    }

    socket.data.user = {
      id: payload.userId,
      username: payload.username,
    };

    return next();
  } catch {
    return next(new Error("Session expired."));
  }
});

io.on("connection", (socket) => {
  socket.on("chat:send", (rawText) => {
    try {
      const text = String(rawText || "").trim();
      if (!text) {
        return;
      }

      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        username: socket.data.user.username,
        text: text.slice(0, 600),
        createdAt: new Date().toISOString(),
      };

      const messages = getMessages();
      messages.push(message);
      saveMessages(messages.slice(-300));

      io.emit("chat:new", message);
    } catch {
      socket.emit("chat:error", "Unable to save message right now.");
    }
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

ensureDataFiles();

server.listen(PORT, HOST, () => {
  console.log(`Fsociety_decoder chat running on http://localhost:${PORT}`);
  console.log(`Network bind: ${HOST}:${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
});
