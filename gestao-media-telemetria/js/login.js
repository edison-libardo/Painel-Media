import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db } from "./services/firebase-client.js";

const form = document.getElementById("login-form");
const errorElement = document.getElementById("login-error");
const noticeElement = document.getElementById("login-notice");
const submit = document.getElementById("login-submit");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const rememberInput = document.getElementById("remember-me");
const resetLink = document.getElementById("forgot-password");

const supportsSavedCredentials = () => (
  typeof window.PasswordCredential === "function"
  && typeof navigator.credentials?.get === "function"
  && typeof navigator.credentials?.store === "function"
);

const restoreSavedCredentials = async () => {
  if (!supportsSavedCredentials()) return;

  try {
    const credential = await navigator.credentials.get({
      password: true,
      mediation: "silent",
    });
    if (credential?.type === "password") {
      emailInput.value = credential.id;
      passwordInput.value = credential.password;
      rememberInput.checked = true;
    }
  } catch (error) {
    noticeElement.textContent = error.message || "Não foi possível carregar as credenciais salvas neste navegador.";
    noticeElement.hidden = false;
  }
};

void restoreSavedCredentials();

const returnTo = () => {
  const requested = new URLSearchParams(window.location.search).get("retorno");
  if (!requested) return "index.html";
  const target = new URL(requested, window.location.origin);
  return target.origin === window.location.origin ? `${target.pathname}${target.search}` : "index.html";
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorElement.hidden = true;
  noticeElement.hidden = true;
  submit.disabled = true;
  submit.textContent = "Verificando...";
  try {
    if (rememberInput.checked && !supportsSavedCredentials()) {
      throw new Error("Este navegador não oferece salvamento seguro de credenciais. Desmarque “Lembrar-me” para entrar sem salvar.");
    }

    const credential = await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value,
    );
    const profile = await getDoc(doc(db, "users", credential.user.uid));
    if (!profile.exists() || !["adm", "consultor"].includes(profile.data().role)) {
      await signOut(auth);
      throw new Error("Este usuário ainda não foi autorizado. Solicite acesso ao administrador.");
    }
    if (rememberInput.checked) {
      try {
        await navigator.credentials.store(new window.PasswordCredential(form));
      } catch (error) {
        rememberInput.checked = false;
        errorElement.textContent = `Login validado, mas as credenciais não foram salvas: ${error.message || "erro do gerenciador do navegador."} Desmarque “Lembrar-me” e tente novamente para entrar sem salvar.`;
        errorElement.hidden = false;
        return;
      }
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

resetLink.addEventListener("click", async (event) => {
  event.preventDefault();
  errorElement.hidden = true;
  noticeElement.hidden = true;

  const email = emailInput.value.trim();
  if (!email) {
    errorElement.textContent = "Informe seu e-mail para receber o link de recuperação.";
    errorElement.hidden = false;
    emailInput.focus();
    return;
  }

  resetLink.setAttribute("aria-disabled", "true");
  try {
    await sendPasswordResetEmail(auth, email);
    noticeElement.textContent = "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha.";
    noticeElement.hidden = false;
  } catch (error) {
    errorElement.textContent = error.message || "Não foi possível solicitar a recuperação da senha.";
    errorElement.hidden = false;
  } finally {
    resetLink.removeAttribute("aria-disabled");
  }
});
