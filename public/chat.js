const sessionToken = localStorage.getItem("sessionToken");
const username = localStorage.getItem("username") || "unknown";

if (!sessionToken) {
  window.location.href = "/login.html";
}

const messagesEl = document.getElementById("messages");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const whoamiEl = document.getElementById("whoami");
const logoutBtn = document.getElementById("logoutBtn");

whoamiEl.textContent = `User: ${username}`;

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMessage(message) {
  const item = document.createElement("div");
  item.className = "msg";
  item.innerHTML = `
    <span class="msg-user">${message.username}</span>
    <span>${message.text}</span>
    <span class="msg-time">${formatTime(message.createdAt)}</span>
  `;
  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function loadRecentMessages() {
  const response = await fetch("/api/messages", {
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    localStorage.removeItem("sessionToken");
    window.location.href = "/login.html";
    return;
  }

  const result = await response.json();
  messagesEl.innerHTML = "";
  result.messages.forEach(renderMessage);
}

const socket = io({
  auth: { token: sessionToken },
});

socket.on("connect_error", () => {
  localStorage.removeItem("sessionToken");
  window.location.href = "/login.html";
});

socket.on("chat:new", (message) => {
  renderMessage(message);
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }
  socket.emit("chat:send", text);
  messageInput.value = "";
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("sessionToken");
  localStorage.removeItem("authorizationToken");
  window.location.href = "/";
});

loadRecentMessages();
