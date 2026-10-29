import fs from "node:fs";

const keys = [
  "OPENAI_API_KEY",
  "ZASHOME_API_KEY",
  "ADMIN_USER",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET"
];

const out = {};
for (const key of keys) {
  const value = process.env[key];
  if (value) out[key] = value;
}

if (!out.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY en GitHub Secrets");
if (!out.ADMIN_USER) throw new Error("Falta ADMIN_USER en GitHub Secrets");
if (!out.ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD en GitHub Secrets");
if (!out.ADMIN_SESSION_SECRET) throw new Error("Falta ADMIN_SESSION_SECRET en GitHub Secrets");

fs.writeFileSync(".secrets.ci.json", JSON.stringify(out, null, 2));
console.log(`Preparados ${Object.keys(out).length} secrets para Wrangler.`);
