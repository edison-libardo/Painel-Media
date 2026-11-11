import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db } from "./services/firebase-client.js";

const form = document.getElementById("login-form");
const errorElement = document.getElementById("login-error");
const submit = document.getElementById("login-submit");

const returnTo = () => {
  const requested = new URLSearchParams(window.location.search).get("retorno");
  if (!requested) return "index.html";
  const target = new URL(requested, window.location.origin);
  return target.origin === window.location.origin ? `${target.pathname}${target.search}` : "index.html";
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorElement.hidden = true;
  submit.disabled = true;
  submit.textContent = "Verificando...";
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-password").value,
    );
    const profile = await getDoc(doc(db, "users", credential.user.uid));
    if (!profile.exists() || !["adm", "consultor"].includes(profile.data().role)) {
      await signOut(auth);
      throw new Error("Este usuário ainda não foi autorizado. Solicite acesso ao administrador.");
    }
    window.location.replace(returnTo());
  } catch (error) {
    errorElement.textContent = error.message || "Não foi possível entrar. Verifique o e-mail e a senha.";
    errorElement.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = "Entrar";
  }
});
