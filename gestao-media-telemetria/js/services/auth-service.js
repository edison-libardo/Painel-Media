import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db } from "./firebase-client.js";

let currentRole = null;

export const getCurrentRole = () => currentRole;
export const isAdmin = () => currentRole === "adm";

const waitForAuth = () => new Promise((resolve, reject) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    resolve(user);
  }, reject);
});

export const requireUser = async () => {
  const user = await waitForAuth();
  if (!user) {
    window.location.replace(`login.html?retorno=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    return null;
  }

  const profile = await getDoc(doc(db, "users", user.uid));
  const role = profile.exists() ? profile.data().role : null;
  if (role !== "adm" && role !== "consultor") {
    await signOut(auth);
    window.location.replace("login.html?erro=sem-perfil");
    return null;
  }

  currentRole = role;
  return { user, role };
};

export const logout = () => signOut(auth);
