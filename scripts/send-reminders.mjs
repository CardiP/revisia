/* Révisia — envoi des rappels du matin.
   Lit le gist de synchronisation (données + abonnements push) et envoie
   une notification Web Push à chaque appareil abonné. */
import webpush from "web-push";

const VAPID_PUBLIC = "BMlbv5LV9G2COqrovQM3FvcdB31-Fx6biev1JvRsq8zFC2BzaUJ5mbnMZZvziyIBMh3Zskv6p-c6o0FD4-zSGWM";
const token = process.env.GIST_TOKEN;
const priv = process.env.VAPID_PRIVATE_KEY;

if (!token || !priv) {
  console.log("Secrets GIST_TOKEN / VAPID_PRIVATE_KEY manquants — rien à envoyer.");
  console.log("→ Sur le Mac : gh secret set GIST_TOKEN --repo CardiP/revisia (colle le même token que la synchro).");
  process.exit(0);
}

const api = async (path, opts = {}) => {
  const r = await fetch("https://api.github.com" + path, {
    ...opts,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(path + " → HTTP " + r.status);
  return r.json();
};

// retrouve le gist Révisia
const gists = await api("/gists?per_page=100");
const meta = gists.find(g => g.files && g.files["revisia-data.json"]);
if (!meta) { console.log("Gist Révisia introuvable — la synchro n'est pas encore activée."); process.exit(0); }
const gist = await api("/gists/" + meta.id);

const readFile = async name => {
  const f = gist.files[name];
  if (!f) return null;
  const content = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  try { return JSON.parse(content); } catch { return null; }
};

const data = await readFile("revisia-data.json");
const push = await readFile("revisia-push.json");
const subs = (push && push.subscriptions) || [];
if (!subs.length) { console.log("Aucun appareil abonné aux rappels."); process.exit(0); }

// date du jour à Paris
const now = new Date();
const today = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(now); // YYYY-MM-DD
const dowName = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short" }).format(now);
const dow = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[dowName];

// compte ce qui attend aujourd'hui
let due = 0;
for (const l of data?.lessons || [])
  for (const r of l.reviews || [])
    if (!r.done && r.due <= today) due++;

let acts = 0;
for (const a of data?.activities || [])
  if (today >= a.start && (a.days || []).includes(dow) && !(a.doneDates || []).includes(today)) acts++;

if (!due && !acts) { console.log("Rien à rappeler aujourd'hui 🎉"); process.exit(0); }

const parts = [];
if (due) parts.push(`${due} révision${due > 1 ? "s" : ""}`);
if (acts) parts.push(`${acts} activité${acts > 1 ? "s" : ""}`);
const body = parts.join(" et ") + ` t'attend${due + acts > 1 ? "ent" : ""} aujourd'hui 💪`;

webpush.setVapidDetails("mailto:hmztwitch933@gmail.com", VAPID_PUBLIC, priv);

const alive = [];
for (const s of subs) {
  try {
    await webpush.sendNotification(s, JSON.stringify({ title: "📚 Révisia", body }));
    alive.push(s);
    console.log("envoyé →", (s.device || "appareil"), s.endpoint.slice(0, 40) + "…");
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      console.log("abonnement expiré, retiré :", s.endpoint.slice(0, 40) + "…");
    } else {
      alive.push(s);
      console.log("erreur d'envoi (" + e.statusCode + ") — abonnement conservé");
    }
  }
}

// nettoie les abonnements morts
if (alive.length !== subs.length) {
  await api("/gists/" + meta.id, {
    method: "PATCH",
    body: JSON.stringify({ files: { "revisia-push.json": { content: JSON.stringify({ subscriptions: alive }, null, 2) } } }),
  });
  console.log("Liste des abonnements nettoyée.");
}
console.log(`Terminé : « ${body} »`);
