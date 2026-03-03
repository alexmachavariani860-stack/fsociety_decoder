const authorizeForm = document.getElementById("authorizeForm");
const authorizeBtn = document.getElementById("authorizeBtn");
const codeInput = document.getElementById("code");
const errorEl = document.getElementById("error");

async function handleAuthorize() {
  errorEl.textContent = "";

  const code = codeInput.value.trim();
  if (!code) {
    errorEl.textContent = "Authorization code is required.";
    return;
  }

  try {
    const response = await fetch("/api/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const result = await response.json();

    if (!response.ok) {
      errorEl.textContent = result.error || "Authorization failed.";
      return;
    }

    localStorage.setItem("authorizationToken", result.authorizationToken);
    window.location.href = "/login.html";
  } catch {
    errorEl.textContent = "Server error. Try again.";
  }
}

authorizeBtn.addEventListener("click", (event) => {
  event.preventDefault();
  handleAuthorize();
});

authorizeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleAuthorize();
});
