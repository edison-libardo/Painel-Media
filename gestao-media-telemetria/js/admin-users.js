import { auth } from "./services/firebase-client.js";

const form = document.getElementById("create-user-form");
const status = document.getElementById("create-user-status");
const submit = document.getElementById("create-user-submit");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.hidden = true;
  submit.disabled = true;
  submit.textContent = "Criando...";

  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch("/.netlify/functions/create-user", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: document.getElementById("new-user-email").value,
        password: document.getElementById("new-user-password").value,
        role: document.getElementById("new-user-role").value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível criar a conta.");
    form.reset();
    status.textContent = `Acesso criado para ${result.email} (${result.role}).`;
    status.className = "text-sm text-emerald-700";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Não foi possível criar o acesso.";
    status.className = "text-sm text-rose-700";
  } finally {
    status.hidden = false;
    submit.disabled = false;
    submit.textContent = "Criar acesso";
  }
});
