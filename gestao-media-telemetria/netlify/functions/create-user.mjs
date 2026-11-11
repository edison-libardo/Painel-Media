import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const json = (body, statusCode = 200) => new Response(JSON.stringify(body), {
  status: statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

const adminApp = () => {
  if (!getApps().length) {
    const rawCredential = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!rawCredential) throw new Error("FIREBASE_SERVICE_ACCOUNT não está configurada no Netlify.");
    initializeApp({ credential: cert(JSON.parse(rawCredential)) });
  }
  return getApps()[0];
};

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return json({ error: "Sessão administrativa necessária." }, 401);

    const app = adminApp();
    const [identity, body] = await Promise.all([
      getAuth(app).verifyIdToken(token, true),
      request.json(),
    ]);
    const profile = await getFirestore(app).doc(`users/${identity.uid}`).get();
    if (profile.data()?.role !== "adm") return json({ error: "Apenas administradores podem criar acessos." }, 403);

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = body.role;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Informe um e-mail válido." }, 400);
    if (password.length < 8) return json({ error: "A senha deve ter pelo menos 8 caracteres." }, 400);
    if (!["adm", "consultor"].includes(role)) return json({ error: "Categoria de acesso inválida." }, 400);

    const user = await getAuth(app).createUser({ email, password, emailVerified: false });
    try {
      await getFirestore(app).doc(`users/${user.uid}`).create({
        email,
        role,
        createdAt: new Date().toISOString(),
        createdBy: identity.uid,
      });
    } catch (error) {
      await getAuth(app).deleteUser(user.uid);
      throw error;
    }
    return json({ uid: user.uid, email, role }, 201);
  } catch (error) {
    console.error("create-user failed:", error);
    return json({ error: error instanceof Error ? error.message : "Não foi possível criar o acesso." }, 500);
  }
};
