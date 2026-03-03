const authToken = localStorage.getItem("authorizationToken");
if (!authToken) {
  window.location.href = "/";
}

const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const statusEl = document.getElementById("status");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");

async function submitAuth(path) {
  statusEl.textContent = "";

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    statusEl.textContent = "Username and password are required.";
    return;
  }

  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-authorization-token": authToken,
      },
      body: JSON.stringify({ username, password }),
    });

    const result = await response.json();

    if (!response.ok) {
      statusEl.textContent = result.error || "Request failed.";
      return;
    }

    if (path === "/api/register") {
      statusEl.className = "success";
      statusEl.textContent = "Registration complete. Now log in.";
      return;
    }

    localStorage.setItem("sessionToken", result.sessionToken);
    localStorage.setItem("username", result.username);
    window.location.href = "/chat.html";
  } catch {
    statusEl.textContent = "Server error. Try again.";
  }
}

loginBtn.addEventListener("click", () => submitAuth("/api/login"));
registerBtn.addEventListener("click", () => submitAuth("/api/register"));
