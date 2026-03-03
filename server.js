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
const AUTH_CODE = process.env.AUTH_CODE || "FSOCIETY_AUTH";
const AUTH_ALIASES = ["Fsociety_decoder"];
const USERS_FILE = path.join(__dirname, "data", "users.json");
const MESSAGES_FILE = path.join(__dirname, "data", "messages.json");

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

function readJson(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallbackValue, null, 2));
      return fallbackValue;
    }

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

function issueAuthToken() {
  return jwt.sign({ phase: "authorized" }, JWT_SECRET, { expiresIn: "30m" });
}

function verifyAuthPhaseToken(req, res, next) {
  const authToken = req.header("x-authorization-token");

  if (!authToken) {
    return res.status(401).json({ error: "Authorization required first." });
  }

  try {
    const payload = jwt.verify(authToken, JWT_SECRET);
    if (payload.phase !== "authorized") {
      return res.status(401).json({ error: "Invalid authorization token." });
    }
    return next();
  } catch {
    return res.status(401).json({ error: "Authorization expired. Re-authorize." });
  }
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

app.post("/api/authorize", (req, res) => {
  const code = String(req.body?.code || "").trim();
  const normalized = code.toLowerCase();
  const isMainCode = normalized === AUTH_CODE.toLowerCase();
  const isAlias = AUTH_ALIASES.some((alias) => normalized === alias.toLowerCase());

  if (!isMainCode && !isAlias) {
    return res.status(401).json({ error: "Invalid authorization code." });
  }

  return res.json({
    success: true,
    authorizationToken: issueAuthToken(),
  });
});

app.post("/api/register", verifyAuthPhaseToken, async (req, res) => {
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
});

app.post("/api/login", verifyAuthPhaseToken, async (req, res) => {
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
});

app.get("/api/messages", (req, res) => {
  const token = req.header("authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Session token required." });
  }

  try {
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
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, HOST, () => {
  console.log(`Fsociety_decoder chat running on http://localhost:${PORT}`);
  console.log(`Network bind: ${HOST}:${PORT}`);
});
