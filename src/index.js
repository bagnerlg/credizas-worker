// credit-two-stage-worker.js
// Cloudflare Worker - Flujo de crédito en DOS ETAPAS
//
// PASO 1 - PRECALIFICACIÓN (pantalla independiente)
//   DPI + datos básicos + clasificación de ingresos + ingreso promedio mensual + producto/monto.
//
// PASO 2 - COMPLETAR EXPEDIENTE (pantalla independiente)
//   Solo después de respuesta positiva.
//   Selfie con DPI + documento de domicilio + sustento cuando corresponda + digitación + 3 referencias.
//   No repite campos ya capturados en Paso 1.

const MODEL_DEFAULT = "gpt-5.4-mini";
const ZASHOME_CATALOG_URL = "https://api.zashome.dpdns.org/api/integrations/excel/catalog";
const CASE_PREFIX = "case:";
const VENDORS_KEY = "config:vendors"; // compatibilidad legado
const SELLER_PREFIX = "seller:";
const SELLER_FAIL_PREFIX = "sellerfail:";
const SELLER_COOKIE = "credizas_seller";
const CASE_STATUSES = ["SUBIDA","EN REVISION","REQUIERE DATOS","REINGRESADO","APROBADA","RECHAZADA"];
const CASE_PROCESSES = ["PRECALIFICACION","FORMALIZACION DE CREDITO"];


// -----------------------------
// PROTECCIÓN DE CUOTA R2
// Cortacircuito interno al 80% del nivel gratuito de R2 Standard.
// Se usa una ventana móvil de 31 días para operaciones y un contador
// conservador de bytes almacenados por esta aplicación.
// -----------------------------
const R2_QUOTA_DEFAULTS = {
  storage_bytes: 8_000_000_000, // 80% de 10 GB
  class_a_31d: 800_000,         // 80% de 1,000,000
  class_b_31d: 8_000_000        // 80% de 10,000,000
};
const R2_QUOTA_PREFIX = "quota:r2:";

function r2QuotaLimits(env) {
  const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback; };
  return {
    storage_bytes: num(env.R2_MAX_STORAGE_BYTES, R2_QUOTA_DEFAULTS.storage_bytes),
    class_a_31d: num(env.R2_MAX_CLASS_A_31D, R2_QUOTA_DEFAULTS.class_a_31d),
    class_b_31d: num(env.R2_MAX_CLASS_B_31D, R2_QUOTA_DEFAULTS.class_b_31d)
  };
}

function r2QuotaEnabled(env) {
  return String(env.R2_QUOTA_ENABLED ?? "true").toLowerCase() !== "false";
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function recentUtcDays(count = 31) {
  const out = [];
  const now = new Date();
  now.setUTCHours(0,0,0,0);
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    out.push(utcDayKey(d));
  }
  return out;
}

async function getR2QuotaUsage(env) {
  const limits = r2QuotaLimits(env);
  if (!env.CREDIZAS_KV) {
    return { ok:false, blocked:true, reason:"CREDIZAS_KV no disponible para controlar la cuota R2.", limits, storage_bytes:0, class_a_31d:0, class_b_31d:0 };
  }
  const storage = await kvGetJson(env, R2_QUOTA_PREFIX + "storage") || { bytes:0 };
  let classA = 0, classB = 0;
  for (const day of recentUtcDays(31)) {
    const row = await kvGetJson(env, R2_QUOTA_PREFIX + "day:" + day);
    if (!row) continue;
    classA += Number(row.class_a || 0);
    classB += Number(row.class_b || 0);
  }
  const storageBytes = Math.max(0, Number(storage.bytes || 0));
  const blocked = storageBytes >= limits.storage_bytes || classA >= limits.class_a_31d || classB >= limits.class_b_31d;
  return {
    ok:true, blocked,
    reason: blocked ? "R2 bloqueado preventivamente: se alcanzó el límite interno de seguridad (80%)." : null,
    storage_bytes: storageBytes,
    class_a_31d: classA,
    class_b_31d: classB,
    pct_storage: Math.min(100, storageBytes / limits.storage_bytes * 80),
    pct_class_a: Math.min(100, classA / limits.class_a_31d * 80),
    pct_class_b: Math.min(100, classB / limits.class_b_31d * 80),
    limits
  };
}

async function reserveR2Usage(env, { class_a = 0, class_b = 0, storage_delta = 0 } = {}) {
  if (!r2QuotaEnabled(env)) return { ok:true, disabled:true };
  const usage = await getR2QuotaUsage(env);
  if (!usage.ok) return usage;
  const next = {
    storage_bytes: Math.max(0, usage.storage_bytes + Number(storage_delta || 0)),
    class_a_31d: usage.class_a_31d + Number(class_a || 0),
    class_b_31d: usage.class_b_31d + Number(class_b || 0)
  };
  if (next.storage_bytes > usage.limits.storage_bytes) return { ok:false, blocked:true, reason:"R2 detenido: el almacenamiento alcanzaría el 80% de la cuota gratuita.", usage, next };
  if (next.class_a_31d > usage.limits.class_a_31d) return { ok:false, blocked:true, reason:"R2 detenido: las operaciones Clase A alcanzarían el 80% de la cuota gratuita.", usage, next };
  if (next.class_b_31d > usage.limits.class_b_31d) return { ok:false, blocked:true, reason:"R2 detenido: las operaciones Clase B alcanzarían el 80% de la cuota gratuita.", usage, next };

  const dayKey = R2_QUOTA_PREFIX + "day:" + utcDayKey();
  const day = await kvGetJson(env, dayKey) || { class_a:0, class_b:0 };
  day.class_a = Number(day.class_a || 0) + Number(class_a || 0);
  day.class_b = Number(day.class_b || 0) + Number(class_b || 0);
  day.updated_at = new Date().toISOString();
  await kvPutJson(env, dayKey, day, { expirationTtl: 40 * 86400 });

  if (storage_delta) {
    await kvPutJson(env, R2_QUOTA_PREFIX + "storage", { bytes:next.storage_bytes, updated_at:new Date().toISOString() });
  }
  return { ok:true, usage:next, limits:usage.limits };
}

function r2QuotaBlockedResponse(result) {
  return json({
    ok:false,
    error: result?.reason || "R2 bloqueado por protección de cuota.",
    code:"R2_QUOTA_GUARD",
    quota: result?.usage || result?.next || null
  }, 507);
}

// -----------------------------
// CAMPOS ETAPA 1: PRECALIFICACIÓN
// Solo identidad extraíble del DPI.
// Los demás datos se completan/revisan manualmente en la interfaz.
// -----------------------------
const STAGE1_FIELDS = [
  ["datos_basicos.nombre_completo", "Nombre completo"],
  ["datos_basicos.numero_dpi", "Número de DPI"],
  ["datos_basicos.fecha_nacimiento", "Fecha de nacimiento"],
  ["datos_basicos.nit", "NIT, solo si aparece explícitamente"],
  ["datos_basicos.estado_civil", "Estado civil, solo si aparece explícitamente en el DPI"],
  ["datos_basicos.nombre_conyuge", "Nombre del cónyuge (si aplica), solo si aparece explícitamente"],
  ["datos_basicos.genero", "Género, únicamente si aparece escrito explícitamente en el DPI"]
];

const STAGE1_KEYS = STAGE1_FIELDS.map(x => x[0]);

const STAGE1_SCHEMA = {
  type: "object",
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file_index: { type: "integer" },
          side: { type: "string", enum: ["anverso", "reverso", "no_determinado"] },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["file_index", "side", "confidence"],
        additionalProperties: false
      }
    },
    dpi_quality: {
      type: "object",
      properties: {
        anverso_legible: { type: "boolean" },
        reverso_legible: { type: "boolean" },
        vigencia: {
          type: "string",
          enum: ["vigente", "vencido", "no_determinado"]
        },
        estado_visual: {
          type: "string",
          enum: ["adecuado", "danado", "no_determinado"]
        },
        notes: { type: "array", items: { type: "string" } }
      },
      required: ["anverso_legible", "reverso_legible", "vigencia", "estado_visual", "notes"],
      additionalProperties: false
    },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: STAGE1_KEYS },
          value: { type: ["string", "null"] },
          normalized_value: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          source_files: { type: "array", items: { type: "integer" } },
          status: { type: "string", enum: ["found", "uncertain", "conflict"] },
          notes: { type: ["string", "null"] }
        },
        required: [
          "key","value","normalized_value","confidence",
          "source_files","status","notes"
        ],
        additionalProperties: false
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  },
  required: ["documents", "dpi_quality", "fields", "warnings"],
  additionalProperties: false
};

// -----------------------------
// CAMPOS ETAPA 2: DOCUMENTOS + RESTO DEL FORMULARIO
// No repetir campos ya capturados en la Etapa 1.
// -----------------------------
const STAGE2_FIELDS = [
  ["domicilio.direccion_completa", "Dirección completa del domicilio"],
  ["digitacion.nombre_empresa", "Nombre de empresa / institución"],
  ["digitacion.giro_oficio", "Giro comercial / actividad / oficio"],
  ["digitacion.direccion_empresa", "Dirección de empresa / negocio / actividad"],
  ["digitacion.telefono_empresa", "Teléfono de empresa / negocio / actividad"],
  ["digitacion.antiguedad", "Antigüedad laboral / negocio / oficio / remesas"]
];

const STAGE2_KEYS = STAGE2_FIELDS.map(x => x[0]);

const STAGE2_SCHEMA = {
  type: "object",
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file_index: { type: "integer" },
          group: { type: "string", enum: ["selfie", "domicilio", "ingresos"] },
          document_type: {
            type: "string",
            enum: [
              "selfie_con_dpi",
              "recibo_luz",
              "recibo_agua",
              "constancia_municipal",
              "constancia_laboral",
              "carta_ingresos",
              "boleta_pago",
              "constancia_jubilacion",
              "constancia_ingresos_independiente",
              "otro",
              "no_identificado"
            ]
          },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["file_index", "group", "document_type", "confidence"],
        additionalProperties: false
      }
    },
    selfie_check: {
      type: "object",
      properties: {
        persona_visible: { type: "boolean" },
        dpi_visible_junto_al_rostro: { type: "boolean" },
        texto_dpi_comparable: {
          type: "string",
          enum: ["coincide", "no_coincide", "insuficiente"]
        },
        notes: { type: "array", items: { type: "string" } }
      },
      required: ["persona_visible", "dpi_visible_junto_al_rostro", "texto_dpi_comparable", "notes"],
      additionalProperties: false
    },
    domicile_consistency: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["consistent", "possible_conflict", "insufficient"] },
        notes: { type: "array", items: { type: "string" } }
      },
      required: ["status", "notes"],
      additionalProperties: false
    },
    income_consistency: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["consistent", "possible_conflict", "insufficient", "not_applicable"] },
        notes: { type: "array", items: { type: "string" } }
      },
      required: ["status", "notes"],
      additionalProperties: false
    },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: STAGE2_KEYS },
          value: { type: ["string", "null"] },
          normalized_value: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          source_files: { type: "array", items: { type: "integer" } },
          status: { type: "string", enum: ["found", "uncertain", "conflict"] },
          notes: { type: ["string", "null"] }
        },
        required: ["key", "value", "normalized_value", "confidence", "source_files", "status", "notes"],
        additionalProperties: false
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  },
  required: ["documents", "selfie_check", "domicile_consistency", "income_consistency", "fields", "warnings"],
  additionalProperties: false
};

// -----------------------------
// UTILIDADES HTTP / ARCHIVOS
// -----------------------------
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function html(body) {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin"
    }
  });
}

function getOpenAIKey(env) {
  let key = String(env.OPENAI_API_KEY || "").trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/^Bearer\s+/i, "").trim();
  if (!key) throw new Error("OPENAI_API_KEY no está configurada.");
  return key;
}

function bytesToBase64(bytes) {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

function extensionOf(name) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function inferMime(file) {
  if (file.type) return file.type;
  const ext = extensionOf(file.name);
  const map = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
    pdf: "application/pdf", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    rtf: "application/rtf", odt: "application/vnd.oasis.opendocument.text", txt: "text/plain"
  };
  return map[ext] || "application/octet-stream";
}

function isDirectImage(file) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(inferMime(file));
}

function isPdf(file) {
  return inferMime(file) === "application/pdf";
}

async function fileToDataUrl(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${inferMime(file)};base64,${bytesToBase64(bytes)}`;
}

async function appendFileToOpenAIContent(content, file, label, env) {
  content.push({
    type: "input_text",
    text: label
  });

  const dataUrl = await fileToDataUrl(file);
  const mime = inferMime(file);

  if (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/gif"
  ) {
    const imageDetail =
      env && env.IMAGE_DETAIL
        ? env.IMAGE_DETAIL
        : "high";

    content.push({
      type: "input_image",
      image_url: dataUrl,
      detail: imageDetail
    });

    return;
  }

  const fileItem = {
    type: "input_file",
    filename: file && file.name ? file.name : "documento",
    file_data: dataUrl
  };

  if (mime === "application/pdf") {
    fileItem.detail =
      env && (env.PDF_DETAIL || env.IMAGE_DETAIL)
        ? (env.PDF_DETAIL || env.IMAGE_DETAIL)
        : "high";
  }

  content.push(fileItem);
}

function extractOutputText(apiResult) {
  const parts = [];
  for (const item of apiResult.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      if (c.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

function assertSupportedFiles(files, { imagesOnly = false, maxFiles = 6, maxEachMB = 12, maxTotalMB = 30 } = {}) {
  if (!files.length) throw new Error("No se recibieron archivos.");
  if (files.length > maxFiles) throw new Error(`Máximo ${maxFiles} archivos.`);

  const allowedMime = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/rtf", "text/rtf", "application/vnd.oasis.opendocument.text", "text/plain"
  ]);
  const allowedExt = new Set(["jpg", "jpeg", "png", "webp", "gif", "pdf", "doc", "docx", "rtf", "odt", "txt"]);

  let total = 0;
  for (const f of files) {
    const mime = inferMime(f);
    const ext = extensionOf(f.name);
    if (imagesOnly && !isDirectImage(f)) throw new Error(`${f.name}: para DPI utiliza una imagen JPG, PNG, WEBP o GIF.`);
    if (!allowedMime.has(mime) && !allowedExt.has(ext)) throw new Error(`Formato no permitido: ${f.name}`);
    if (f.size > maxEachMB * 1024 * 1024) throw new Error(`${f.name} supera ${maxEachMB} MB.`);
    total += f.size;
  }
  if (total > maxTotalMB * 1024 * 1024) throw new Error(`La carga total supera ${maxTotalMB} MB.`);
}

// -----------------------------
// OPENAI RESPONSES
// -----------------------------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchOpenAIWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callStructuredOpenAI({
  env,
  content,
  schema,
  schemaName,
  maxOutputTokens = 2500,
  timeoutMs = 90000
}) {
  const body = {
    model: env.OPENAI_MODEL || MODEL_DEFAULT,
    store: false,
    reasoning: { effort: "none" },
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema
      }
    },
    max_output_tokens: maxOutputTokens
  };

  const requestOptions = {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getOpenAIKey(env)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };

  const retryableStatuses = new Set([408, 409, 500, 502, 503, 504, 520, 522, 524]);
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let r;

    try {
      r = await fetchOpenAIWithTimeout(
        "https://api.openai.com/v1/responses",
        requestOptions,
        timeoutMs
      );
    } catch (err) {
      const timedOut =
        err?.name === "AbortError" ||
        String(err?.message || err || "").toLowerCase().includes("timeout");

      lastError = new Error(
        timedOut
          ? `OpenAI tardó más de ${Math.round(timeoutMs / 1000)} segundos.`
          : `No se pudo conectar con OpenAI: ${err?.message || err}`
      );

      if (attempt < 2) {
        await sleep(800);
        continue;
      }

      throw lastError;
    }

    const raw = await r.text();
    const data = safeJsonParse(raw);
    const requestId = r.headers.get("x-request-id") || null;

    if (r.ok) {
      if (!data) {
        throw new Error(
          `OpenAI respondió HTTP ${r.status}, pero la respuesta no era JSON.` +
          (requestId ? ` Request ID: ${requestId}.` : "")
        );
      }

      const out = extractOutputText(data);
      if (!out) {
        throw new Error(
          "OpenAI no devolvió datos estructurados." +
          (requestId ? ` Request ID: ${requestId}.` : "")
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch {
        throw new Error(
          "OpenAI respondió, pero el contenido estructurado no pudo convertirse a JSON." +
          (requestId ? ` Request ID: ${requestId}.` : "")
        );
      }

      return {
        parsed,
        request_id: requestId
      };
    }

    const apiMessage =
      data?.error?.message ||
      data?.message ||
      raw?.trim()?.slice(0, 500) ||
      `HTTP ${r.status}`;

    if (r.status === 401) {
      throw new Error("OpenAI rechazó la API key. " + apiMessage);
    }

    if (r.status === 429) {
      throw new Error("OpenAI reportó límite/cuota. " + apiMessage);
    }

    lastError = new Error(
      `OpenAI devolvió HTTP ${r.status}: ${apiMessage}` +
      (requestId ? ` | Request ID: ${requestId}` : "")
    );

    if (attempt < 2 && retryableStatuses.has(r.status)) {
      await sleep(1000);
      continue;
    }

    throw lastError;
  }

  throw lastError || new Error("Error desconocido consultando OpenAI.");
}


function getIncomeSupportPolicy(source, origin, subtype) {
  const s = String(source || "").trim().toUpperCase();
  const o = String(origin || "").trim().toUpperCase();

  if (s === "SALARIO" && o === "SALARIO FORMAL") {
    return {
      required: true,
      code: "SALARIO_FORMAL_REQUIERE_SUSTENTO",
      title: "Debes pedir sustento de ingresos",
      guidance: "Pide constancia o carta laboral, boleta de pago u otro documento que confirme el empleo y el ingreso."
    };
  }

  if (s === "SALARIO" && o === "SALARIO INFORMAL") {
    return {
      required: false,
      code: "SALARIO_INFORMAL_SIN_CONSTANCIA",
      title: "No necesitas pedir constancia de ingresos",
      guidance: "Continúa con los datos de actividad/oficio, dirección, teléfono y antigüedad."
    };
  }

  if (s === "RENTAS" && o === "REMESAS") {
    return {
      required: false,
      code: "REMESAS_SIN_CONSTANCIA",
      title: "No necesitas pedir constancia de ingresos",
      guidance: "Continúa con los datos de la actividad/remesas y antigüedad."
    };
  }

  if (s === "RENTAS" && o === "JUBILADO") {
    return {
      required: true,
      code: "JUBILADO_REQUIERE_SUSTENTO",
      title: "Debes pedir sustento de jubilación",
      guidance: "Pide constancia, comprobante o documento que confirme la jubilación/pensión y el ingreso."
    };
  }

  if (s === "VENTAS" && o === "INDEPENDIENTE FORMAL") {
    return {
      required: true,
      code: "INDEPENDIENTE_FORMAL_REQUIERE_CONSTANCIA",
      title: "Constancia de ingresos obligatoria",
      guidance: "Pide una constancia de ingresos o documento equivalente del cliente independiente formal."
    };
  }

  if (s === "VENTAS" && o === "INDEPENDIENTE INFORMAL") {
    return {
      required: false,
      code: "INDEPENDIENTE_INFORMAL_SIN_SUSTENTO",
      title: "No presenta sustento de ingresos",
      guidance: "No pidas constancia. Completa giro/oficio, dirección, teléfono y antigüedad."
    };
  }

  return {
    required: false,
    code: "SIN_REGLA",
    title: "Sin regla definida",
    guidance: "Revisa la clasificación de ingresos del Paso 1."
  };
}

async function extractStage1({
  dpiFront,
  dpiBack,
  env
}) {
  const prompt = `
TAREA: EXTRAER DATOS DE IDENTIDAD PARA UNA PRECALIFICACIÓN.

ARCHIVOS:
1. DPI ANVERSO.
2. DPI REVERSO.

EXTRAE ÚNICAMENTE CUANDO APAREZCA DE FORMA EXPLÍCITA:
- Nombre completo.
- Número de DPI.
- Fecha de nacimiento.
- NIT, solo si está impreso.
- Estado civil. Solo devuelve SOLTERO, CASADO o VIUDO cuando aparezca explícitamente. Si aparece otro estado o no es claro, omite el campo.
- Nombre del cónyuge (si aplica), solo si está impreso.
- Género, solo si está escrito explícitamente.

REGLAS:
- No inventes información.
- No infieras género, estado civil, edad ni ninguna característica a partir de la fotografía.
- Fecha inequívoca: YYYY-MM-DD.
- Número DPI: conserva todos los dígitos y ceros.
- NIT: no lo derives del DPI. Solo devolverlo si existe impreso explícitamente.
- Evalúa legibilidad de ambos lados, vigencia cuando pueda determinarse y estado visual.
- Si un dato no aparece, no lo incluyas.
- Si existe conflicto entre lados, usa status="conflict".
- confidence mide confianza de lectura, no calidad crediticia.
`.trim();

  const content = [];
  content.push({
    type: "input_text",
    text: prompt
  });

  await appendFileToOpenAIContent(
    content,
    dpiFront,
    "ARCHIVO 1: DPI ANVERSO",
    env
  );

  await appendFileToOpenAIContent(
    content,
    dpiBack,
    "ARCHIVO 2: DPI REVERSO",
    env
  );

  return callStructuredOpenAI({
    env: env,
    content: content,
    schema: STAGE1_SCHEMA,
    schemaName: "credit_stage1_prequalification",
    maxOutputTokens: 1800,
    timeoutMs: 90000
  });
}

async function addFileContent(content, file, label, env) {
  await appendFileToOpenAIContent(
    content,
    file,
    label,
    env
  );
}

async function extractStage2({ selfieFile, utilityFiles, incomeFiles, stage1Data, env }) {
  const source = stage1Data?.informacion_complementaria?.fuente_ingresos || "";
  const origin = stage1Data?.informacion_complementaria?.origen_ingresos || "";
  const subtype = stage1Data?.informacion_complementaria?.subtipo_ingreso || "";
  const policy = getIncomeSupportPolicy(source, origin, subtype);

  const prompt = `
TAREA: COMPLETAR LA ETAPA 2 DE UNA SOLICITUD YA PRECALIFICADA.

DATOS DEL PASO 1 (YA CAPTURADOS; NO LOS REPITAS COMO CAMPOS NUEVOS):
${JSON.stringify(stage1Data || {}, null, 2)}

CLASIFICACIÓN DE INGRESOS:
- Fuente: ${source}
- Origen: ${origin}
- Subtipo: ${subtype}
- Regla documental: ${policy.code}

ARCHIVOS:
1. Selfie del cliente sosteniendo el DPI a la altura del rostro.
2 en adelante. Recibo de luz, agua o constancia municipal.
Después, si fueron solicitados, documentos de sustento de ingresos.

OBJETIVOS:
1. SELFIE: no hagas reconocimiento facial ni comparación biométrica. Solo verifica:
   - que exista una persona visible;
   - que sostenga un DPI junto al rostro;
   - que el texto/número visible del DPI permita comparar con el DPI del Paso 1.
2. DOMICILIO: extrae únicamente la dirección completa.
   - Compara departamento/municipio del documento contra los ya capturados en Paso 1, pero NO los vuelvas a generar como campos.
3. INGRESOS/DIGITACIÓN: extrae únicamente los datos necesarios según la clasificación:
   - empresa/institución cuando corresponda;
   - giro/actividad/oficio cuando corresponda;
   - dirección de empresa/negocio/actividad;
   - teléfono;
   - antigüedad.
4. No repitas nombre, DPI, nacimiento, NIT personal, celular, estado civil, género, producto, monto solicitado,
   clasificación de ingresos, tipo de vivienda, departamento, municipio ni educación: ya vienen del Paso 1.
5. No inventes información. Si no aparece, omite el campo.
6. Si un documento contradice el Paso 1, reporta conflicto/advertencia, no lo reemplaces silenciosamente.
7. file_index inicia en 1: primero selfie, luego domicilio, luego ingresos.
`.trim();

  const content = [{ type: "input_text", text: prompt }];
  let idx = 1;

  await addFileContent(content, selfieFile, "ARCHIVO " + idx + " - SELFIE CON DPI", env);
  idx++;

  for (let i = 0; i < utilityFiles.length; i++) {
    await addFileContent(
      content,
      utilityFiles[i],
      "ARCHIVO " + idx + " - DOMICILIO - " + utilityFiles[i].name,
      env
    );
    idx++;
  }

  for (let i = 0; i < incomeFiles.length; i++) {
    await addFileContent(
      content,
      incomeFiles[i],
      "ARCHIVO " + idx + " - SUSTENTO DE INGRESOS - " + incomeFiles[i].name,
      env
    );
    idx++;
  }

  return callStructuredOpenAI({
    env: env,
    content: content,
    schema: STAGE2_SCHEMA,
    schemaName: "credit_stage2_completion",
    maxOutputTokens: 3200,
    timeoutMs: 90000
  });
}


// -----------------------------
// CATÁLOGO ZASHOME / PERSISTENCIA
// -----------------------------
function normalizeCatalogItem(x) {
  return {
    producto_id: x?.producto_id || null,
    sku: x?.sku || "",
    nombre: x?.nombre || x?.descripcion || "",
    descripcion: x?.descripcion || x?.nombre || "",
    categoria: x?.categoria || "",
    tipo_producto: x?.tipo_producto || "",
    precio: Number(x?.precio || 0),
    imagen_principal_url: x?.imagen_principal_url || x?.imagen_producto_url || "",
    activo: x?.activo !== false
  };
}

async function fetchCatalogFromZasHome(env, params = {}) {
  const url = new URL(ZASHOME_CATALOG_URL);
  for (const key of ["q", "category", "type"]) {
    if (params[key]) url.searchParams.set(key, String(params[key]));
  }

  const headers = { Accept: "application/json" };
  if (env.ZASHOME_API_KEY) headers.Authorization = `Bearer ${env.ZASHOME_API_KEY}`;

  const r = await fetch(url.toString(), { method: "GET", headers });
  const raw = await r.text();
  if (!r.ok) throw new Error(`ZasHome catálogo HTTP ${r.status}: ${raw.slice(0, 500)}`);

  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("ZasHome devolvió catálogo no válido."); }
  const source = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  const seen = new Set();
  const out = [];
  for (const row of source) {
    const item = normalizeCatalogItem(row);
    if (!item.activo || !item.precio || !item.nombre) continue;
    const key = item.producto_id || `${item.sku}|${item.nombre}|${item.precio}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  out.sort((a,b) => a.nombre.localeCompare(b.nombre, "es"));
  return out;
}

async function findCatalogProduct(env, productId, sku) {
  const query = sku || productId || "";
  const list = await fetchCatalogFromZasHome(env, { q: query });
  let item = list.find(x => productId && x.producto_id === productId);
  if (!item) item = list.find(x => sku && x.sku === sku);
  return item || null;
}

function requestedAmountFromCatalogPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1.5 * 100) / 100;
}

async function kvGetJson(env, key) {
  if (!env.CREDIZAS_KV) return null;
  const raw = await env.CREDIZAS_KV.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function kvPutJson(env, key, value, options = {}) {
  if (!env.CREDIZAS_KV) return false;
  await env.CREDIZAS_KV.put(key, JSON.stringify(value), options);
  return true;
}

async function getVendors(env) {
  const fromKv = await kvGetJson(env, VENDORS_KEY);
  if (Array.isArray(fromKv)) return fromKv;
  if (env.VENDEDORES_JSON) {
    try {
      const list = JSON.parse(env.VENDEDORES_JSON);
      if (Array.isArray(list)) return list;
    } catch {}
  }
  return [];
}

function caseSummary(record) {
  const s1 = record?.stage1?.data || {};
  const b = s1?.datos_basicos || {};
  const sol = s1?.solicitud || {};
  const comp = s1?.informacion_complementaria || {};
  const currentControl = record?.proceso === "FORMALIZACION DE CREDITO" && record?.stage2
    ? (record.stage2.control || {})
    : (record?.stage1?.control || {});
  return {
    id: record?.id,
    vendedor_id: record?.vendedor_id || "",
    vendedor: record?.vendedor || "",
    nombre: b?.nombre_completo || "",
    dpi: b?.numero_dpi || "",
    nit: b?.nit || "",
    telefono: b?.numero_celular || "",
    producto: sol?.producto_solicitado || "",
    producto_sku: sol?.producto_sku || "",
    precio_catalogo: Number(sol?.producto_precio_catalogo || 0),
    monto: Number(sol?.monto_total_solicitado || 0),
    ingreso: Number(comp?.ingreso_promedio_mensual || 0),
    proceso: record?.proceso || (record?.stage2 ? "FORMALIZACION DE CREDITO" : "PRECALIFICACION"),
    estado: record?.estado || record?.stage2?.control?.estado || record?.stage1?.control?.estado || "SUBIDA",
    detalle: currentControl?.detalle || record?.ultimo_requerimiento || "",
    procede: record?.procede_cliente || "",
    cerrado: (record?.estado || "") === "RECHAZADA",
    updated_at: record?.updated_at || record?.created_at || null,
    created_at: record?.created_at || null,
    stage1_submitted_at: record?.stage1?.submitted_at || null,
    stage2_submitted_at: record?.stage2?.submitted_at || null,
    tiene_paso1: Boolean(record?.stage1),
    tiene_paso2: Boolean(record?.stage2),
    pdf_stage1: Boolean(record?.pdfs?.stage1),
    pdf_final: Boolean(record?.pdfs?.final)
  };
}

async function loadCaseRecord(env, id) {
  return kvGetJson(env, CASE_PREFIX + id);
}

async function saveCaseRecord(env, record) {
  if (!env.CREDIZAS_KV) return false;
  record.updated_at = new Date().toISOString();
  if (!record.created_at) record.created_at = record.updated_at;
  await kvPutJson(env, CASE_PREFIX + record.id, record);
  return true;
}

async function listCaseRecords(env, { q = "", seller = "", status = "", process = "", sort = "updated_desc" } = {}) {
  if (!env.CREDIZAS_KV) return [];
  const listed = await env.CREDIZAS_KV.list({ prefix: CASE_PREFIX, limit: 200 });
  const records = [];
  for (const key of listed.keys || []) {
    const rec = await kvGetJson(env, key.name);
    if (rec) records.push(rec);
  }
  const needle = String(q || "").trim().toLowerCase();
  let out = records.filter(rec => {
    const s = caseSummary(rec);
    if (seller && String(s.vendedor) !== String(seller)) return false;
    if (status && String(s.estado) !== String(status)) return false;
    if (process && String(s.proceso) !== String(process)) return false;
    if (needle) {
      const hay = [s.nombre, s.dpi, s.nit, s.telefono].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  out.sort((a,b) => {
    const A = caseSummary(a), B = caseSummary(b);
    if (sort === "name_asc") return A.nombre.localeCompare(B.nombre, "es");
    if (sort === "nit_asc") return A.nit.localeCompare(B.nit, "es");
    if (sort === "date_asc") return String(A.updated_at||"").localeCompare(String(B.updated_at||""));
    return String(B.updated_at||"").localeCompare(String(A.updated_at||""));
  });
  return out;
}


function safeR2FileName(name) {
  return String(name || "archivo")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "archivo";
}


function stage1DocumentEntries(record) {
  const groups = record?.stage1_documents || {};
  return ["front","back"].flatMap(k => Array.isArray(groups[k]) ? groups[k] : []);
}

async function persistStage1Documents(env, record, caseId, groups) {
  if (!env.CREDIZAS_FILES) throw new Error("R2 no está configurado para conservar las fotos del DPI.");
  const current = record.stage1_documents || { front:[], back:[] };
  const changed = [];
  let oldBytes = 0, newBytes = 0, classA = 0;
  for (const category of ["front","back"]) {
    const files = Array.isArray(groups[category]) ? groups[category] : [];
    const old = Array.isArray(current[category]) ? current[category] : [];
    if (sameStoredGroup(old, files)) continue;
    changed.push({ category, files, old });
    oldBytes += old.reduce((a, x) => a + Number(x?.size || 0), 0);
    newBytes += files.reduce((a, x) => a + Number(x?.size || 0), 0);
    classA += old.length + files.length;
  }
  if (!changed.length) return current;
  const quota = await reserveR2Usage(env, { class_a:classA, storage_delta:newBytes-oldBytes });
  if (!quota.ok) throw new Error(quota.reason || "R2 bloqueado por protección de cuota.");
  const next = { front:[...(current.front||[])], back:[...(current.back||[])] };
  for (const item of changed) {
    for (const old of item.old) if (old?.key) await env.CREDIZAS_FILES.delete(old.key);
    const metas = [];
    for (let i=0;i<item.files.length;i++) {
      const file=item.files[i];
      const id=`stage1-${item.category}-${i}`;
      const key=`cases/${caseId}/documents/stage1/${item.category}/${i}-${safeR2FileName(file.name)}`;
      await env.CREDIZAS_FILES.put(key,file.stream(),{
        httpMetadata:{contentType:file.type||"application/octet-stream"},
        customMetadata:{case_id:String(caseId),category:`stage1-${item.category}`,original_name:String(file.name||"archivo")}
      });
      metas.push({id,category:`stage1-${item.category}`,key,name:file.name||"archivo",type:file.type||"application/octet-stream",size:Number(file.size||0),uploaded_at:new Date().toISOString()});
    }
    next[item.category]=metas;
  }
  record.stage1_documents=next;
  return next;
}

function findCaseDocument(record, docId) {
  return [...stage1DocumentEntries(record), ...stage2DocumentEntries(record)].find(x => String(x?.id || "") === String(docId || "")) || null;
}

function stage2DocumentEntries(record) {
  const groups = record?.stage2_documents || {};
  return ["selfie","utility","income"].flatMap(k => Array.isArray(groups[k]) ? groups[k] : []);
}

function sameStoredGroup(existing, files) {
  const old = Array.isArray(existing) ? existing : [];
  if (old.length !== files.length) return false;
  return old.every((m, i) => {
    const f = files[i];
    return String(m?.name || "") === String(f?.name || "") &&
      Number(m?.size || 0) === Number(f?.size || 0) &&
      String(m?.type || "") === String(f?.type || "");
  });
}

async function persistStage2Documents(env, record, caseId, groups) {
  if (!env.CREDIZAS_FILES) throw new Error("R2 no está configurado para conservar los documentos del Paso 2.");
  const current = record.stage2_documents || { selfie:[], utility:[], income:[] };
  const changed = [];
  let oldBytes = 0, newBytes = 0, classA = 0;
  for (const category of ["selfie","utility","income"]) {
    const files = Array.isArray(groups[category]) ? groups[category] : [];
    const old = Array.isArray(current[category]) ? current[category] : [];
    if (sameStoredGroup(old, files)) continue;
    changed.push({ category, files, old });
    oldBytes += old.reduce((a, x) => a + Number(x?.size || 0), 0);
    newBytes += files.reduce((a, x) => a + Number(x?.size || 0), 0);
    classA += old.length + files.length;
  }
  if (!changed.length) return current;

  const quota = await reserveR2Usage(env, { class_a:classA, storage_delta:newBytes-oldBytes });
  if (!quota.ok) throw new Error(quota.reason || "R2 bloqueado por protección de cuota.");

  const next = { selfie:[...(current.selfie||[])], utility:[...(current.utility||[])], income:[...(current.income||[])] };
  for (const item of changed) {
    for (const old of item.old) {
      if (old?.key) await env.CREDIZAS_FILES.delete(old.key);
    }
    const metas = [];
    for (let i = 0; i < item.files.length; i++) {
      const file = item.files[i];
      const id = item.category + "-" + i;
      const key = `cases/${caseId}/documents/${item.category}/${i}-${safeR2FileName(file.name)}`;
      await env.CREDIZAS_FILES.put(key, file.stream(), {
        httpMetadata:{ contentType:file.type || "application/octet-stream" },
        customMetadata:{ case_id:String(caseId), category:item.category, original_name:String(file.name || "archivo") }
      });
      metas.push({ id, category:item.category, key, name:file.name || "archivo", type:file.type || "application/octet-stream", size:Number(file.size || 0), uploaded_at:new Date().toISOString() });
    }
    next[item.category] = metas;
  }
  record.stage2_documents = next;
  return next;
}

function findStage2Document(record, docId) {
  return stage2DocumentEntries(record).find(x => String(x?.id || "") === String(docId || "")) || null;
}

function cookieMap(request) {
  const out = {};
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}

function bytesToBase64Url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

async function hmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return bytesToBase64Url(sig);
}

async function createAdminToken(env, user) {
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "";
  if (!secret) throw new Error("Configura ADMIN_SESSION_SECRET o ADMIN_PASSWORD.");
  const payload = btoa(JSON.stringify({ u:user, exp:Date.now()+8*60*60*1000 })).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  return payload + "." + await hmacHex(secret, payload);
}

async function verifyAdmin(request, env) {
  const token = cookieMap(request).credizas_admin;
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "";
  if (!secret) return false;
  if (await hmacHex(secret, payload) !== sig) return false;
  try {
    const padded = payload.replace(/-/g,"+").replace(/_/g,"/") + "===".slice((payload.length+3)%4);
    const data = JSON.parse(atob(padded));
    return data.exp > Date.now() && data.u === (env.ADMIN_USER || "admin");
  } catch { return false; }
}


function normalizeSellerName(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

async function listSellers(env) {
  if (!env.CREDIZAS_KV) return [];
  const listed = await env.CREDIZAS_KV.list({ prefix: SELLER_PREFIX, limit: 500 });
  const out = [];
  for (const key of listed.keys || []) {
    const row = await kvGetJson(env, key.name);
    if (row?.id && row?.name && row.active !== false) out.push({ id:row.id, name:row.name, created_at:row.created_at || null });
  }
  out.sort((a,b) => a.name.localeCompare(b.name, "es"));
  return out;
}

async function sellerPinHash(env, sellerId, pin) {
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "credizas-local-secret";
  return hmacHex(secret, `seller:${sellerId}:${pin}`);
}

async function createSellerToken(env, seller) {
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "";
  if (!secret) throw new Error("Configura ADMIN_SESSION_SECRET.");
  const payload = btoa(JSON.stringify({ sid:seller.id, n:seller.name, exp:Date.now()+12*60*60*1000 })).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  return payload + "." + await hmacHex(secret, payload);
}

async function verifySeller(request, env) {
  const token = cookieMap(request)[SELLER_COOKIE];
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "";
  if (!secret || await hmacHex(secret, payload) !== sig) return null;
  try {
    const padded = payload.replace(/-/g,"+").replace(/_/g,"/") + "===".slice((payload.length+3)%4);
    const data = JSON.parse(atob(padded));
    if (!(data.exp > Date.now()) || !data.sid) return null;
    const seller = await kvGetJson(env, SELLER_PREFIX + data.sid);
    if (!seller || seller.active === false) return null;
    return { id:seller.id, name:seller.name };
  } catch { return null; }
}

function sellerOwnsCase(record, seller) {
  if (!record || !seller) return false;
  if (record.vendedor_id) return String(record.vendedor_id) === String(seller.id);
  return normalizeSellerName(record.vendedor).toLowerCase() === normalizeSellerName(seller.name).toLowerCase();
}

function sellerCasePermissions(record) {
  const process = record?.proceso || "PRECALIFICACION";
  const state = record?.estado || "SUBIDA";
  const has1 = Boolean(record?.stage1);
  const has2 = Boolean(record?.stage2);
  const closed = state === "RECHAZADA";
  return {
    edit_stage1: !closed && process === "PRECALIFICACION" && has1 && state === "REQUIERE DATOS",
    start_stage2: !closed && process === "FORMALIZACION DE CREDITO" && has1 && !has2,
    edit_stage2: !closed && process === "FORMALIZACION DE CREDITO" && has2 && state === "REQUIERE DATOS",
    view_stage1: has1,
    view_stage2: process === "FORMALIZACION DE CREDITO" && has1,
    closed,
    requirement: state === "REQUIERE DATOS" ? (record?.ultimo_requerimiento || record?.stage2?.control?.detalle || record?.stage1?.control?.detalle || "") : ""
  };
}

function addCaseHistory(record, event, actor, detail = {}) {
  record.history = Array.isArray(record.history) ? record.history : [];
  record.history.push({ at:new Date().toISOString(), event, actor, ...detail });
  if (record.history.length > 80) record.history = record.history.slice(-80);
}

function currentControlForRecord(record) {
  if (record?.proceso === "FORMALIZACION DE CREDITO" && record?.stage2) return record.stage2.control || (record.stage2.control = {});
  if (record?.stage1) return record.stage1.control || (record.stage1.control = {});
  return null;
}

const ADMIN_EXPORT_FIELDS = {
  updated_at: "Fecha actualización",
  created_at: "Fecha creación",
  nombre: "Cliente",
  dpi: "DPI",
  nit: "NIT",
  telefono: "Teléfono",
  vendedor: "Vendedor",
  proceso: "Proceso",
  estado: "Estado",
  detalle: "Detalle / información requerida",
  procede: "Qué procede con el cliente",
  producto: "Producto",
  producto_sku: "SKU",
  precio_catalogo: "Precio catálogo interno",
  monto: "Monto solicitado",
  ingreso: "Ingreso promedio mensual"
};

function xmlEscape(v) {
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&apos;");
}

function makeExcelXml(records, fields) {
  const cols = fields.filter(f => ADMIN_EXPORT_FIELDS[f]);
  const cell = (value, type="String") => `<Cell><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
  const rows = [];
  rows.push(`<Row>${cols.map(f => cell(ADMIN_EXPORT_FIELDS[f])).join("")}</Row>`);
  for (const rec of records) {
    const row = caseSummary(rec);
    rows.push(`<Row>${cols.map(f => {
      let v = row[f] ?? "";
      if (["monto","ingreso","precio_catalogo"].includes(f)) return cell(Number(v || 0), "Number");
      if (["updated_at","created_at"].includes(f) && v) { try { v = new Date(v).toLocaleString("es-GT"); } catch {} }
      return cell(v);
    }).join("")}</Row>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="CrediZas"><Table>${rows.join("")}</Table></Worksheet></Workbook>`;
}

// -----------------------------
// INTEGRACIONES / SIMULACIÓN
// -----------------------------
async function postJsonToExternal(url, token, payload) {
  const headers = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;

  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await r.text();
  let responseBody;
  try { responseBody = JSON.parse(text); } catch { responseBody = text; }

  if (!r.ok) throw new Error(`Endpoint externo HTTP ${r.status}: ${String(text).slice(0, 800)}`);
  return { status: r.status, response: responseBody };
}

function deriveStage2IncomeRule(source, origin) {
  const s = String(source || "").trim().toUpperCase();
  const o = String(origin || "").trim().toUpperCase();

  if (s === "SALARIO" && o === "SALARIO FORMAL") {
    return { required: true, code: "SALARIO_FORMAL_REQUIERE_SUSTENTO" };
  }
  if (s === "SALARIO" && o === "SALARIO INFORMAL") {
    return { required: false, code: "SALARIO_INFORMAL_SIN_CONSTANCIA" };
  }
  if (s === "RENTAS" && o === "REMESAS") {
    return { required: false, code: "REMESAS_SIN_CONSTANCIA" };
  }
  if (s === "RENTAS" && o === "JUBILADO") {
    return { required: true, code: "JUBILADO_REQUIERE_SUSTENTO" };
  }
  if (s === "VENTAS" && o === "INDEPENDIENTE FORMAL") {
    return { required: true, code: "INDEPENDIENTE_FORMAL_REQUIERE_CONSTANCIA" };
  }
  if (s === "VENTAS" && o === "INDEPENDIENTE INFORMAL") {
    return { required: false, code: "INDEPENDIENTE_INFORMAL_SIN_SUSTENTO" };
  }
  return { required: false, code: "SIN_REGLA" };
}

async function submitInitialValidation(payload, env) {
  if (!env.INITIAL_VALIDATION_URL) {
    return {
      forwarded: false,
      mode: "simulation",
      status: "pending",
      request_id: crypto.randomUUID(),
      message: "No hay endpoint de validación inicial configurado. Usa los botones de simulación.",
      sent_payload: payload
    };
  }

  const out = await postJsonToExternal(env.INITIAL_VALIDATION_URL, env.INITIAL_VALIDATION_TOKEN, payload);
  return {
    forwarded: true,
    mode: "real",
    status: "received",
    request_id: crypto.randomUUID(),
    external: out
  };
}

async function submitFinal(payload, env) {
  if (!env.FINAL_SYSTEM_URL) {
    return {
      forwarded: false,
      mode: "preview",
      message: "FINAL_SYSTEM_URL no está configurado. JSON consolidado listo para integración.",
      payload
    };
  }

  const out = await postJsonToExternal(env.FINAL_SYSTEM_URL, env.FINAL_SYSTEM_TOKEN, payload);
  return { forwarded: true, mode: "real", external: out };
}

// -----------------------------
// HTML / UI
// -----------------------------
function textField(name, label, type = "text", extra = "") {
  return `<div class="field" data-field="${name}"><label>${label}</label><input name="${name}" type="${type}" autocomplete="off" ${extra}><span class="field-meta"></span></div>`;
}

function selectField(name, label, options) {
  return `<div class="field" data-field="${name}"><label>${label}</label><select name="${name}">${options.map(x => `<option value="${x}">${x || "Seleccionar"}</option>`).join("")}</select><span class="field-meta"></span></div>`;
}

function yesNo(name, label) {
  return selectField(name, label, ["", "SI", "NO"]);
}

const APP_HTML = String.raw`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Solicitud fácil de crédito</title>
<style>
:root{--bg:#f5f7fb;--card:#fff;--line:#dce3ee;--text:#172033;--muted:#667085;--blue:#14577a;--yellow:#ffc400;--ok:#16a36a;--warn:#e99a18;--bad:#e5483d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,Segoe UI,Arial,sans-serif}header{background:#fff;border-bottom:1px solid var(--line);padding:18px}.header{max-width:1280px;margin:auto;display:flex;justify-content:space-between;gap:16px;align-items:center}.brand{font-size:13px;color:var(--blue);font-weight:900}.brand b{color:#d49f00}h1{font-size:21px;margin:3px 0}.subtitle{color:var(--muted);font-size:12px}main{max-width:1280px;margin:22px auto;padding:0 18px 60px}.screen.hidden,.hidden{display:none!important}.progress{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px}.pstep{border:1px solid var(--line);background:#edf1f6;color:#718096;padding:12px;border-radius:12px;font-weight:800;font-size:13px}.pstep.active{background:#e8f5fb;color:var(--blue);border-color:#9bd2e4}.pstep.done{background:#eaf8f1;color:#11734b;border-color:#a9e3c7}.pstep.blocked{background:#fff0ef;color:#b42318;border-color:#f6bbb7}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:18px;box-shadow:0 5px 18px rgba(25,41,70,.04)}.card h2{font-size:18px;margin:0 0 8px}.card h3{font-size:14px;margin:22px 0 10px}.muted{color:var(--muted)}.notice{padding:12px 14px;border-radius:10px;background:#edf7fc;color:#175f7c;font-size:13px;margin:12px 0}.notice.success{background:#eaf8f1;color:#11734b}.notice.warning{background:#fff7e8;color:#945d00}.notice.bad{background:#fff0ef;color:#b42318}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:950px){.grid{grid-template-columns:repeat(2,1fr)}.grid3{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.grid,.grid3,.two,.progress{grid-template-columns:1fr}}.section-title{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:9px;margin-bottom:13px}.badge{display:inline-flex;border-radius:999px;padding:4px 8px;background:#e8eef5;color:#526277;font-size:10px;font-weight:800}.badge.ok{background:#dcfce7;color:#166534}.badge.warn{background:#ffedd5;color:#9a3412}.badge.bad{background:#fee2e2;color:#991b1b}.upload-card{border:1px solid var(--line);border-radius:14px;padding:13px;background:#fbfcfe}.upload-title{font-size:12px;font-weight:900;margin-bottom:8px;color:#43506a}.file-input{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:8px;background:#fff}.file-input::file-selector-button{border:0;border-radius:8px;padding:9px 12px;margin-right:9px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer}.preview{height:230px;border:1px solid #d8e0ea;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-top:10px}.preview img{width:100%;height:100%;object-fit:contain}.preview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:12px}.doc-preview-card{border:1px solid #d8e0ea;border-radius:12px;background:#fff;overflow:hidden}.doc-preview-head{padding:8px 10px;border-bottom:1px solid #e7ecf2;font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.doc-preview-body{height:230px;background:#f8fafc;display:flex;align-items:center;justify-content:center;overflow:hidden}.doc-preview-body img{width:100%;height:100%;object-fit:contain}.doc-preview-body iframe{width:100%;height:100%;border:0}.doc-preview-foot{padding:7px 10px;border-top:1px solid #e7ecf2;font-size:10px;color:var(--muted)}.file-meta{font-size:11px;color:var(--muted);margin-top:7px}.field{display:flex;flex-direction:column;gap:5px}.field label{font-size:12px;font-weight:750;color:#43506a}.field input,.field select,.field textarea{width:100%;border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:10px 11px;font:inherit}.field textarea{min-height:78px;resize:vertical}.field input[readonly]{background:#f3f6f9;color:#475467;font-weight:700}.field-meta{font-size:10px;color:#718096;min-height:13px}.field.ai-found input,.field.ai-found select,.field.ai-found textarea{border-color:#79d8ac;background:#f2fbf6}.field.ai-uncertain input,.field.ai-uncertain select,.field.ai-uncertain textarea{border-color:#f1bd65;background:#fffaf0}.field.ai-conflict input,.field.ai-conflict select,.field.ai-conflict textarea{border-color:#ef8d86;background:#fff5f4}.field.invalid-state input,.field.invalid-state select,.field.invalid-state textarea{border-color:#ef4444!important;background:#fff1f2!important;box-shadow:0 0 0 1px rgba(239,68,68,.08)}.field.valid-state input,.field.valid-state select,.field.valid-state textarea{border-color:#22a06b!important;background:#effaf4!important}.validation-box{border:1px solid #ef4444;background:#fff1f2;color:#991b1b;border-radius:12px;padding:12px 14px;margin-top:16px;font-size:12px}.validation-box.ok{border-color:#22a06b;background:#effaf4;color:#166534}.fixed-rule{border:1px solid #86d3aa;background:#effaf4;color:#166534;border-radius:9px;padding:10px 11px;font-size:12px;font-weight:800;min-height:42px;display:flex;align-items:center}.word-preview{height:100%;width:100%;overflow:hidden;background:#fff;padding:10px;font-size:9px;line-height:1.25;color:#172033}.word-preview h1,.word-preview h2,.word-preview h3{font-size:11px;margin:5px 0}.word-preview p{margin:3px 0}.word-preview table{font-size:8px;border-collapse:collapse;width:100%}.word-preview td,.word-preview th{border:1px solid #dde4ec;padding:2px}.word-fallback{text-align:center;padding:20px;color:#14577a}.word-fallback strong{display:block;font-size:16px;margin-bottom:8px}.result-accordion{padding:0!important;overflow:hidden}.result-accordion summary{list-style:none;cursor:pointer;padding:18px 20px;display:flex;gap:10px;align-items:center;justify-content:space-between;font-weight:900}.result-accordion summary::-webkit-details-marker{display:none}.result-accordion .accordion-body{padding:0 20px 20px}.expand-hint{font-size:11px;color:#667085;font-weight:700}.result-accordion[open] .expand-hint::after{content:" · Ocultar"}.result-accordion:not([open]) .expand-hint::after{content:" · Expandir"}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:15px}button{border:0;border-radius:10px;padding:11px 15px;font-weight:800;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.primary{background:var(--blue);color:#fff}.yellow{background:var(--yellow);color:#2f2a00}.secondary{background:#e9eef5;color:#334155}.positive{background:var(--ok);color:#fff}.negative{background:var(--bad);color:#fff}.spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;vertical-align:-2px}@keyframes spin{to{transform:rotate(360deg)}}pre{white-space:pre-wrap;word-break:break-word;background:#101827;color:#dbe7f3;border-radius:12px;padding:14px;font-size:11px;max-height:440px;overflow:auto}.tablebox{overflow:auto;border:1px solid var(--line);border-radius:10px}.rules{width:100%;border-collapse:collapse;font-size:12px}.rules th,.rules td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left}.rules th{background:#f8fafc}.step-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.summary-chip{border:1px solid var(--line);border-radius:10px;padding:10px;background:#fafcff;font-size:12px}.reference-list{display:grid;gap:14px}.reference-card{border:1px solid #cfd9e6;border-radius:14px;background:#fbfcfe;padding:15px}.reference-card-title{font-size:14px;font-weight:900;color:var(--blue);padding-bottom:8px;margin-bottom:12px;border-bottom:1px solid #dfe6ef}.reference-card .grid{grid-template-columns:repeat(5,minmax(0,1fr))}.product-search-wrap{position:relative}.product-results{position:absolute;z-index:40;left:0;right:0;top:100%;max-height:340px;overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 12px 28px rgba(15,23,42,.16);margin-top:4px}.product-option{display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;padding:9px;border-bottom:1px solid #edf1f5;cursor:pointer}.product-option:hover{background:#f2f8fb}.product-option img{width:54px;height:54px;object-fit:cover;border-radius:8px;background:#eef2f6}.product-option .po-name{font-size:11px;font-weight:800}.product-option .po-meta{font-size:10px;color:#667085}.product-option .po-price{font-weight:900;color:#14577a;font-size:12px}.selected-product{border:1px solid #86d3aa;background:#effaf4;border-radius:14px;padding:12px;margin-top:10px;font-size:11px}.selected-product-card{display:grid;grid-template-columns:92px 1fr;gap:14px;align-items:center}.selected-product-card img{width:92px;height:92px;object-fit:contain;border-radius:10px;background:#fff;border:1px solid #d8e5dc}.selected-product-card .sp-name{font-size:15px;font-weight:900;color:#153f55;margin-bottom:4px}.selected-product-card .sp-sku{font-size:11px;color:#667085}.selected-product-card .sp-amount{font-size:14px;font-weight:900;color:#11734b;margin-top:7px}.seller-login-grid{display:grid;grid-template-columns:1fr 180px auto;gap:10px;align-items:end}.seller-bar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.lock-note{border:1px solid #f0c36b;background:#fff8e8;color:#7b5100;border-radius:10px;padding:11px 13px;margin-bottom:12px}.case-row .case-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}@media(max-width:700px){.seller-login-grid{grid-template-columns:1fr}}.home-actions{display:grid;grid-template-columns:1fr 1fr;gap:16px}.home-panel{border:1px solid var(--line);border-radius:14px;padding:16px;background:#fff}.case-results{display:grid;gap:8px;margin-top:12px}.case-row{border:1px solid var(--line);border-radius:10px;padding:11px;background:#fafcff;display:flex;justify-content:space-between;gap:12px;align-items:center}.case-row strong{display:block}.case-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.seller-state{font-size:10px;font-weight:900;border-radius:999px;padding:4px 8px;background:#e8eef5;color:#475467}.seller-state.review{background:#e0f2fe;color:#075985}.seller-state.ok{background:#dcfce7;color:#166534}.seller-state.bad{background:#fee2e2;color:#991b1b}.seller-state.warn{background:#ffedd5;color:#9a3412}.seller-process{font-size:10px;font-weight:800;border-radius:999px;padding:4px 8px;background:#f1f5f9;color:#475569}.status-row{display:grid;grid-template-columns:180px 1fr;gap:12px;align-items:end}.state-detail.hidden{display:none!important}.top-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.draft-banner{border:1px solid #f4c56d;background:#fff8e8;color:#805400;padding:10px 12px;border-radius:10px;margin-top:10px}.catalog-price-note{font-size:10px;color:#667085;margin-top:4px}@media(max-width:700px){.home-actions,.status-row{grid-template-columns:1fr}}@media(max-width:1050px){.reference-card .grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.step-summary,.reference-card .grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
<div class="header">
  <div><div class="brand">Zas<b>Home</b> · Centro Inteligente de Información</div><h1 id="pageTitle">Solicitud fácil de crédito · Paso 1</h1><div class="subtitle" id="pageSubtitle">Sube el DPI, revisa los datos y completa lo que falta.</div></div>
  <div class="top-nav"><button type="button" class="secondary" id="homeBtn">Inicio</button><a href="/admin" target="_blank" style="text-decoration:none"><button type="button" class="secondary">Administrador</button></a><span class="badge">Fácil y guiado</span></div>
</div>
</header>
<main>

<section id="screenLogin" class="screen">
  <section class="card">
    <div class="section-title"><h2>Ingreso de vendedor</h2><span class="badge">Acceso</span></div>
    <div class="notice">Selecciona tu nombre e ingresa tu PIN de 4 números. Si eres vendedor nuevo, crea tu acceso una sola vez.</div>
    <div class="seller-login-grid">
      <div class="field"><label>Vendedor</label><select id="sellerLoginSelect"><option value="">Cargando vendedores...</option></select></div>
      <div class="field"><label>PIN de 4 números</label><input id="sellerLoginPin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="••••"></div>
      <button type="button" class="primary" id="sellerLoginBtn">Ingresar</button>
    </div>
    <div id="sellerLoginMsg"></div>
    <details style="margin-top:18px"><summary style="cursor:pointer;font-weight:900;color:#14577a">Soy vendedor nuevo · Crear acceso</summary>
      <div class="grid3" style="margin-top:12px">
        <div class="field"><label>Nombre completo *</label><input id="newSellerName" placeholder="Ej. MARÍA LÓPEZ"></div>
        <div class="field"><label>Crear PIN *</label><input id="newSellerPin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="4 números"></div>
        <div class="field"><label>Confirmar PIN *</label><input id="newSellerPin2" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="Repite el PIN"></div>
      </div>
      <button type="button" class="yellow" id="registerSellerBtn" style="margin-top:12px">Crear mi acceso</button><div id="registerSellerMsg"></div>
    </details>
  </section>
</section>

<section id="screenHome" class="screen hidden">
  <section class="card">
    <div class="seller-bar"><div><div class="section-title" style="border:0;margin:0;padding:0"><h2>Mis solicitudes</h2></div><div class="muted" id="sellerGreeting"></div></div><button type="button" class="secondary" id="sellerLogoutBtn">Cerrar sesión</button></div>
    <div id="draftBanner" class="draft-banner hidden"><strong>Hay un borrador guardado en este equipo.</strong><br><button type="button" id="resumeDraftBtn" class="yellow" style="margin-top:8px">Retomar borrador</button></div>
    <div class="home-actions" style="margin-top:14px">
      <div class="home-panel"><h3 style="margin-top:0">Nueva solicitud</h3><p class="muted">Crea una nueva precalificación para un cliente.</p><button type="button" class="primary" id="newCaseBtn">Nueva solicitud</button></div>
      <div class="home-panel"><h3 style="margin-top:0">Buscar mis solicitudes</h3><div class="field"><label>Nombre, DPI, NIT o teléfono</label><input id="caseSearchInput" placeholder="Buscar cliente"></div><button type="button" class="secondary" id="caseSearchBtn" style="margin-top:12px">Buscar</button></div>
    </div>
    <div id="caseSearchResults" class="case-results" style="margin-top:16px"></div>
  </section>
</section>

<section id="screen1" class="screen hidden">
  <div class="progress"><div class="pstep active" id="p1">1 · Subir DPI</div><div class="pstep" id="p2">2 · Revisar datos</div><div class="pstep" id="p3">3 · Enviar solicitud</div><div class="pstep" id="p4">4 · Resultado</div></div>

  <section class="card">
    <div class="section-title"><h2>1. Sube el DPI del cliente</h2><span class="badge">Solo esto para empezar</span></div>
    <div class="notice">Sube una foto clara del DPI por enfrente y por atrás. El sistema leerá automáticamente lo que pueda y luego te pedirá completar únicamente lo que falte.</div>
    <div class="two">
      <div class="upload-card"><div class="upload-title">Foto 1: DPI de enfrente *</div><input id="dpiFront" class="file-input" type="file" accept="image/*"><div class="preview" id="prevDpiFront"><span class="muted">Pendiente</span></div><div class="file-meta" id="metaDpiFront">Sin archivo</div></div>
      <div class="upload-card"><div class="upload-title">Foto 2: DPI de atrás *</div><input id="dpiBack" class="file-input" type="file" accept="image/*"><div class="preview" id="prevDpiBack"><span class="muted">Pendiente</span></div><div class="file-meta" id="metaDpiBack">Sin archivo</div></div>
    </div>
    <div id="uploadStatus" class="notice warning">Sube primero las dos fotos del DPI: enfrente y atrás.</div>
    <div class="actions"><button type="button" class="primary" id="analyzeBtn" disabled>Leer datos del DPI</button><button type="button" class="secondary" id="resetBtn">Reiniciar</button></div><div id="extractMsg"></div>
  </section>

  <section class="card hidden" id="formCard">
    <div class="section-title"><h2>2. Revisa y completa los datos del cliente</h2><span class="badge" id="qualityBadge">Revisar</span></div><div id="qualityBox"></div>
    <form id="preForm">
      <div class="grid">
        ${textField("datos_basicos.nombre_completo","Nombre completo *")}
        ${textField("datos_basicos.numero_dpi","Número de DPI *")}
        ${textField("datos_basicos.fecha_nacimiento","Fecha de nacimiento *","date")}
        ${textField("datos_basicos.nit","NIT *")}
        ${textField("datos_basicos.numero_celular","Celular del cliente *","tel")}
        ${selectField("datos_basicos.estado_civil","Estado civil *",["","SOLTERO","CASADO","VIUDO"])}
        ${textField("datos_basicos.nombre_conyuge","Nombre del cónyuge (si aplica)")}
        ${selectField("datos_basicos.genero","Género *",["","MASCULINO","FEMENINO"])}
        ${textField("datos_basicos.producto_interes","Producto de interés","text",'readonly value="CCO ELECTRO"')}
        <div class="field product-search-wrap" data-field="solicitud.producto_solicitado"><label>¿Qué producto quiere el cliente? *</label><input id="productSearch" type="text" autocomplete="off" placeholder="Busca por nombre o SKU"><input type="hidden" name="solicitud.producto_solicitado"><input type="hidden" name="solicitud.producto_id"><input type="hidden" name="solicitud.producto_sku"><input type="hidden" name="solicitud.producto_imagen_url"><div id="productResults" class="product-results hidden"></div><div id="selectedProduct" class="selected-product hidden"></div><span class="field-meta">Catálogo activo de ZasHome.</span></div>
        ${textField("solicitud.monto_total_solicitado","¿Cuánto desea solicitar el cliente?","number",'readonly step="0.01"')}
        ${textField("informacion_complementaria.ingreso_promedio_mensual","Ingreso promedio mensual del cliente *","number",'min="0" step="0.01"')}
        ${textField("datos_basicos.dpi_foto","DPI FOTO","text","readonly")}
      </div>

      <h3>¿Cómo obtiene sus ingresos?</h3>
      <div class="notice warning"><strong>Guía sencilla:</strong> elige primero la Fuente. El sistema te mostrará solo los Orígenes correctos y luego colocará el Subtipo correspondiente.</div>
      <div class="grid3">
        ${selectField("informacion_complementaria.fuente_ingresos","Fuente de ingresos *",["","SALARIO","RENTAS","VENTAS"])}
        ${selectField("informacion_complementaria.origen_ingresos","Origen de ingresos *",[""])}
        ${selectField("informacion_complementaria.subtipo_ingreso","Subtipo de ingreso *",[""])}
      </div>

      <h3>Información complementaria</h3>
      <div class="grid">
        ${textField("informacion_complementaria.tipo_nacionalidad","Tipo de nacionalidad","text",'readonly value="GUATEMALA"')}
        ${selectField("informacion_complementaria.tipo_vivienda","Tipo de vivienda *",["","PROPIA","VIVE CON FAMILIARES","ARRENDADA","PRESTADA"])}
        ${textField("informacion_complementaria.departamento","Departamento del domicilio *")}
        ${textField("informacion_complementaria.municipio","Municipio del domicilio *")}
        ${selectField("informacion_complementaria.nivel_educacion","Nivel de educación *",["","PRIMARIA","BÁSICOS","DIVERSIFICADO","UNIVERSIDAD","OTRO"])}
      </div>
      <div id="stage1AdminNotice" class="hidden"></div>

      <div id="stage1ValidationBox" class="validation-box">Completa los campos obligatorios marcados en rojo.</div>
      <label style="display:flex;gap:9px;align-items:flex-start;margin-top:18px"><input id="verified" type="checkbox" style="margin-top:4px"><span>Confirmo que revisé los datos del cliente y completé lo que hacía falta.</span></label>
      <div class="actions"><button type="submit" class="yellow" id="submitBtn">Enviar solicitud del paso 1</button><button type="button" class="secondary hidden" id="cancelEditStage1">Cancelar edición</button><button type="button" class="secondary" id="showJsonBtn">Ver datos enviados</button><button type="button" class="primary" id="stage1PdfBtnForm" disabled>Descargar PDF del Paso 1</button></div><div class="muted" id="stage1PdfHint" style="margin-top:8px">El PDF se habilita después de enviar correctamente el Paso 1.</div><div id="submitMsg"></div><pre id="jsonPreview" class="hidden"></pre>
    </form>
  </section>

  <section class="card hidden" id="decisionCard"><div class="section-title"><h2>3. Solicitud enviada</h2><span class="badge ok" id="decisionBadge">Subida</span></div><div id="decisionBody"></div><div class="actions"><button type="button" class="secondary" id="stage1PdfBtn" disabled>Descargar expediente del Paso 1 (PDF)</button><button type="button" class="primary" id="backHomeAfterStage1">Volver a mis solicitudes</button></div></section>
</section>

<section id="screen2" class="screen hidden">
  <div class="progress"><div class="pstep done">1 · Precalificación</div><div class="pstep active">2 · Documentos</div><div class="pstep">3 · Completar datos</div><div class="pstep">4 · Envío final</div></div>

  <section class="card">
    <div class="section-title"><h2>Paso 2 · Documentos y datos restantes</h2><span class="badge ok">Paso 1 aprobado</span></div>
    <div class="notice success">No volveremos a pedir los datos del Paso 1. Aquí solo debes solicitar al cliente lo que falta para completar el expediente.</div><div id="stage2AccessNotice"></div>
    <div class="step-summary" id="stage2Summary"></div><div class="actions"><button type="button" class="secondary" id="stage1PdfBtn2">Descargar PDF del Paso 1</button><button type="button" class="primary" id="finalPdfBtnTop" disabled>Descargar expediente completo (PDF)</button></div><div class="muted" id="finalPdfHint" style="margin-top:8px">El expediente completo se habilita después de enviar correctamente el Paso 2.</div>
  </section>

  <section class="card">
    <div class="section-title"><h2>1. Documentos que debes pedir ahora</h2><span class="badge">Te indicamos cuáles</span></div>
    <div class="grid3">
      <div class="upload-card"><div class="upload-title">SELFIE CON DPI *</div><div class="muted">Foto del cliente sosteniendo el DPI a la altura del rostro.</div><input id="stage2Selfie" class="file-input" type="file" accept="image/*"><div class="preview" id="prevStage2Selfie"><span class="muted">Pendiente</span></div><div class="file-meta" id="metaStage2Selfie">Sin archivo</div></div>
      <div class="upload-card"><div class="upload-title">DOCUMENTO DE DOMICILIO *</div><div class="muted">Recibo de luz, agua o constancia municipal.</div><input id="stage2Utility" class="file-input" type="file" accept="image/*,.pdf,.doc,.docx,.rtf,.odt,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple><div class="file-meta" id="metaStage2Utility">Sin archivo</div><div class="preview-grid" id="previewStage2Utility"></div></div>
      <div class="upload-card" id="stage2IncomeCard"><div class="upload-title" id="stage2IncomeTitle">SUSTENTO DE INGRESOS</div><div class="muted" id="stage2IncomeHelp"></div><input id="stage2Income" class="file-input" type="file" accept="image/*,.pdf,.doc,.docx,.rtf,.odt,.txt,application/pdf" multiple><div class="file-meta" id="metaStage2Income">Sin archivo</div><div class="preview-grid" id="previewStage2Income"></div></div>
    </div>
    <div id="stage2DocsStatus" class="notice warning">Completa los documentos indicados.</div>
    <div class="actions"><button type="button" class="primary" id="stage2AnalyzeBtn" disabled>Leer documentos y completar datos</button></div><div id="stage2ExtractMsg"></div>
  </section>

  <section class="card hidden" id="stage2FormCard">
    <div class="section-title"><h2>2. Completa únicamente lo que falta</h2><span class="badge" id="stage2QualityBadge">Revisar</span></div>
    <div id="stage2QualityBox"></div>
    <form id="stage2Form">
      <h3>Domicilio</h3>
      <div class="notice">El departamento y municipio ya vienen del Paso 1. Solo pedimos la dirección completa porque es el dato necesario para terminar esta sección.</div>
      <div class="grid">
        ${textField("domicilio.direccion_completa","Dirección completa *")}
      </div>

      <div id="companyGroup" class="hidden">
        <h3 id="companyGroupTitle">Datos de empresa / institución</h3>
        <div class="notice" id="companyGuide"></div>
        <div class="grid">
          ${textField("digitacion.nombre_empresa","Nombre de empresa / institución *")}
          ${textField("digitacion.direccion_empresa","Dirección completa *")}
          ${textField("digitacion.telefono_empresa","Teléfono *","tel")}
          ${textField("digitacion.antiguedad","Antigüedad *")}
        </div>
      </div>

      <div id="activityGroup" class="hidden">
        <h3>Datos de actividad / oficio / remesas</h3>
        <div class="notice">Pregunta al cliente qué actividad realiza. Si no tiene local, usa su domicilio. Si no tiene teléfono comercial, usa su celular. La antigüedad es el tiempo que lleva realizando la actividad, oficio o recibiendo remesas.</div>
        <div class="grid">
          ${textField("digitacion.giro_oficio","Giro, actividad u oficio *")}
          ${textField("digitacion.direccion_empresa","Dirección de la actividad *")}
          ${textField("digitacion.telefono_empresa","Teléfono de la actividad *","tel")}
          ${textField("digitacion.antiguedad","Tiempo realizando la actividad *")}
        </div>
      </div>

      <h3>3 referencias personales o familiares</h3>
      <div class="notice warning">Completa una ficha por persona. Debe ser familiar o amistad que no viva con el cliente, ser mayor de edad, ser localizable y poder confirmar el lugar de vivienda del cliente y sus datos laborales. El cónyuge no aplica como referencia.</div>
      <div class="reference-list">
        <div class="reference-card">
          <div class="reference-card-title">Referencia 1</div>
          <div class="grid">
            ${textField("referencias.0.nombre_completo","Nombre completo *")}
            ${textField("referencias.0.parentesco","Parentesco *")}
            ${textField("referencias.0.celular","Celular *","tel")}
            <input type="hidden" name="referencias.0.mayor_edad_confirmado" value="SI"><div class="field"><label>Mayor de edad</label><div class="fixed-rule">✓ SÍ · requisito fijo</div><div class="field-meta">Toda referencia debe ser mayor de edad.</div></div>
            <input type="hidden" name="referencias.0.mismo_domicilio" value="NO"><div class="field"><label>Vive con el cliente</label><div class="fixed-rule">✓ NO · requisito fijo</div><div class="field-meta">Debe ser familiar o amistad que no viva con el cliente.</div></div>
            <input type="hidden" name="referencias.0.certifica_datos" value="SI"><div class="field"><label>Puede confirmar información</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">Debe certificar lugar de vivienda del cliente y confirmar datos laborales.</div></div>
            <input type="hidden" name="referencias.0.localizable" value="SI"><div class="field"><label>Localizable</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">La referencia debe poder ser localizada.</div></div>
          </div>
        </div>
        <div class="reference-card">
          <div class="reference-card-title">Referencia 2</div>
          <div class="grid">
            ${textField("referencias.1.nombre_completo","Nombre completo *")}
            ${textField("referencias.1.parentesco","Parentesco *")}
            ${textField("referencias.1.celular","Celular *","tel")}
            <input type="hidden" name="referencias.1.mayor_edad_confirmado" value="SI"><div class="field"><label>Mayor de edad</label><div class="fixed-rule">✓ SÍ · requisito fijo</div><div class="field-meta">Toda referencia debe ser mayor de edad.</div></div>
            <input type="hidden" name="referencias.1.mismo_domicilio" value="NO"><div class="field"><label>Vive con el cliente</label><div class="fixed-rule">✓ NO · requisito fijo</div><div class="field-meta">Debe ser familiar o amistad que no viva con el cliente.</div></div>
            <input type="hidden" name="referencias.1.certifica_datos" value="SI"><div class="field"><label>Puede confirmar información</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">Debe certificar lugar de vivienda del cliente y confirmar datos laborales.</div></div>
            <input type="hidden" name="referencias.1.localizable" value="SI"><div class="field"><label>Localizable</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">La referencia debe poder ser localizada.</div></div>
          </div>
        </div>
        <div class="reference-card">
          <div class="reference-card-title">Referencia 3</div>
          <div class="grid">
            ${textField("referencias.2.nombre_completo","Nombre completo *")}
            ${textField("referencias.2.parentesco","Parentesco *")}
            ${textField("referencias.2.celular","Celular *","tel")}
            <input type="hidden" name="referencias.2.mayor_edad_confirmado" value="SI"><div class="field"><label>Mayor de edad</label><div class="fixed-rule">✓ SÍ · requisito fijo</div><div class="field-meta">Toda referencia debe ser mayor de edad.</div></div>
            <input type="hidden" name="referencias.2.mismo_domicilio" value="NO"><div class="field"><label>Vive con el cliente</label><div class="fixed-rule">✓ NO · requisito fijo</div><div class="field-meta">Debe ser familiar o amistad que no viva con el cliente.</div></div>
            <input type="hidden" name="referencias.2.certifica_datos" value="SI"><div class="field"><label>Puede confirmar información</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">Debe certificar lugar de vivienda del cliente y confirmar datos laborales.</div></div>
            <input type="hidden" name="referencias.2.localizable" value="SI"><div class="field"><label>Localizable</label><div class="fixed-rule">✓ SÍ · requisito</div><div class="field-meta">La referencia debe poder ser localizada.</div></div>
          </div>
        </div>
      </div>
      <div id="stage2AdminNotice" class="hidden"></div>

      <div id="stage2ValidationBox" class="validation-box">Completa los campos obligatorios marcados en rojo.</div>
      <label style="display:flex;gap:9px;align-items:flex-start;margin-top:18px"><input id="stage2Verified" type="checkbox" style="margin-top:4px"><span>Confirmo que revisé los documentos y completé los datos faltantes con el cliente.</span></label>
      <div class="actions"><button type="submit" class="yellow" id="finalSubmitBtn">Enviar expediente completo</button><button type="button" class="secondary hidden" id="cancelEditStage2">Cancelar edición</button><button type="button" class="secondary" id="stage2JsonBtn">Ver expediente</button><button type="button" class="primary" id="finalPdfBtn" disabled>Descargar expediente completo (PDF)</button></div><div id="finalMsg"></div><pre id="stage2JsonPreview" class="hidden"></pre>
    </form>
  </section>

  <details class="card result-accordion hidden" id="finalResultCard"><summary><span>Expediente terminado</span><span class="badge ok">Completo</span><span class="expand-hint">Resultado</span></summary><div class="accordion-body" id="finalResultBody"></div></details>
</section>

</main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mammoth@1.10.0/mammoth.browser.min.js"></script>
<script>
const q=s=>document.querySelector(s);
let extracted=null,sentPayload=null,requestId=null,stage2Extraction=null,stage1Decision=null,finalPayloadCache=null,currentCaseId=null,currentSeller="",currentSellerId="",sellerSession=null,currentPermissions={},currentRecordState=null,stage2AnalyzedSignature="";
const pageParams=new URLSearchParams(location.search);const adminMode=pageParams.get("admin")==="1";const adminCaseId=pageParams.get("case_id")||"";const adminSellerId=pageParams.get("seller_id")||"";
const preparedUploads={dpiFront:[],dpiBack:[],stage2Selfie:[],stage2Utility:[],stage2Income:[]};

const DRAFT_KEY="credizas_draft_v19";
const FILE_DB="credizas_files_v19";

function digits8(v){return String(v||"").replace(/\D/g,"").slice(0,8)}
function validPhone(v){return /^\d{8}$/.test(String(v||""))}
function setupPhoneInputs(){document.querySelectorAll('input[type="tel"]').forEach(el=>{el.inputMode="numeric";el.maxLength=8;el.pattern="[0-9]{8}";el.addEventListener("input",()=>{el.value=digits8(el.value);saveDraftSoon()})})}
function stage2Signature(){return [preparedUploads.stage2Selfie,...preparedUploads.stage2Utility,...preparedUploads.stage2Income].map(f=>[f.name,f.size,f.lastModified].join(":" )).join("|")}
function invalidateStage2Analysis(){stage2AnalyzedSignature="";q("#stage2ExtractMsg").innerHTML=""}
function selectedSeller(){return currentSeller||sellerSession?.name||""}
function showOnly(id){for(const x of ["screenLogin","screenHome","screen1","screen2"])q("#"+x)?.classList.toggle("hidden",x!==id)}
let sellerRefreshTimer=null;
function startSellerAutoRefresh(){if(sellerRefreshTimer)return;sellerRefreshTimer=setInterval(()=>{if(sellerSession&&!q("#screenHome")?.classList.contains("hidden"))loadSellerCases().catch(()=>{})},5000)}
function goHome(){if(adminMode){location.href="/admin";return}if(!sellerSession){showOnly("screenLogin");return}showOnly("screenHome");q("#pageTitle").textContent="CrediZas · Mis solicitudes";q("#pageSubtitle").textContent="Consulta el estado de tus clientes o crea una nueva solicitud.";q("#sellerGreeting").textContent="Vendedor: "+sellerSession.name;loadSellerCases();startSellerAutoRefresh()}
function sellerStateLabel(v){return v==="REQUIERE DATOS"?"REQUIERE INFORMACIÓN":v==="EN REVISION"?"EN REVISIÓN":v}
function sellerProcessLabel(v){return v==="FORMALIZACION DE CREDITO"?"Formalización de crédito":"Precalificación"}
function sellerStateClass(v){return v==="APROBADA"?"ok":v==="RECHAZADA"?"bad":v==="REQUIERE DATOS"||v==="REINGRESADO"?"warn":v==="EN REVISION"?"review":""}

function flattenObject(obj,prefix="",out={}){if(obj===null||obj===undefined)return out;for(const [k,v] of Object.entries(obj)){const path=prefix?prefix+"."+k:k;if(Array.isArray(v)){v.forEach((x,i)=>flattenObject(x,path+"."+i,out))}else if(v&&typeof v==="object")flattenObject(v,path,out);else out[path]=v}return out}
function fillForm(form,data){const flat=flattenObject(data);for(const [name,value] of Object.entries(flat)){const el=form.querySelector('[name="'+CSS.escape(name)+'"]');if(el&&value!==null&&value!==undefined){el.value=String(value);el.dispatchEvent(new Event("change",{bubbles:true}))}}}

let draftTimer=null;
function saveDraftSoon(){clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,250)}
function saveDraft(){if(adminMode)return;try{const data={case_id:currentCaseId,seller:currentSeller||selectedSeller(),seller_id:currentSellerId||sellerSession?.id||"",screen:q("#screen2")&&!q("#screen2").classList.contains("hidden")?"screen2":"screen1",stage1:collect(q("#preForm")),stage2:collect(q("#stage2Form")),sentPayload,requestId,stage1Decision};localStorage.setItem(DRAFT_KEY,JSON.stringify(data));q("#draftBanner")?.classList.remove("hidden")}catch{}}
function clearDraft(clearFiles=true){localStorage.removeItem(DRAFT_KEY);q("#draftBanner")?.classList.add("hidden");if(clearFiles)clearCachedFiles().catch(()=>{})}

function openFileDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(FILE_DB,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains("files"))db.createObjectStore("files")};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function localFileKey(key){return String(currentCaseId||"draft")+":"+key}
async function cacheFiles(key,files){try{const db=await openFileDb();await new Promise((resolve,reject)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").put(files,localFileKey(key));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch{}}
async function readCachedFiles(key){try{const db=await openFileDb();const value=await new Promise((resolve,reject)=>{const tx=db.transaction("files","readonly");const r=tx.objectStore("files").get(localFileKey(key));r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});db.close();return value}catch{return []}}
async function clearCachedFiles(){try{const db=await openFileDb();await new Promise((resolve,reject)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch{}}

async function restorePreparedFiles(){for(const key of Object.keys(preparedUploads)){const fs=await readCachedFiles(key);if(Array.isArray(fs)&&fs.length)preparedUploads[key]=fs}if(preparedUploads.dpiFront[0]){q("#prevDpiFront").innerHTML='<img src="'+objUrl(preparedUploads.dpiFront[0])+'">';q("#metaDpiFront").textContent=preparedUploads.dpiFront[0].name}if(preparedUploads.dpiBack[0]){q("#prevDpiBack").innerHTML='<img src="'+objUrl(preparedUploads.dpiBack[0])+'">';q("#metaDpiBack").textContent=preparedUploads.dpiBack[0].name}if(preparedUploads.stage2Selfie[0]){q("#prevStage2Selfie").innerHTML='<img src="'+objUrl(preparedUploads.stage2Selfie[0])+'">';q("#metaStage2Selfie").textContent=preparedUploads.stage2Selfie[0].name}await renderMulti(q("#previewStage2Utility"),preparedUploads.stage2Utility);await renderMulti(q("#previewStage2Income"),preparedUploads.stage2Income);updateButtons()}


function stage1StoredGroups(rec){return rec?.stage1_documents||{front:[],back:[]}}
async function storedCaseDocToFile(meta){const u="/api/cases/"+encodeURIComponent(currentCaseId)+"/documents/"+encodeURIComponent(meta.id);const r=await fetch(u,{cache:"no-store"});if(!r.ok){let msg="No se pudo recuperar "+(meta.name||"documento");try{const d=await r.json();msg=d.error||msg}catch{}throw new Error(msg)}const blob=await r.blob();return new File([blob],meta.name||"documento",{type:meta.type||blob.type||"application/octet-stream",lastModified:Date.parse(meta.uploaded_at||"")||Date.now()})}
async function restoreServerStage1Documents(rec){const groups=stage1StoredGroups(rec),errors=[];for(const [dest,src] of [["dpiFront","front"],["dpiBack","back"]]){const metas=Array.isArray(groups[src])?groups[src]:[];if(metas.length){try{const file=await storedCaseDocToFile(metas[0]);preparedUploads[dest]=[file];await cacheFiles(dest,[file])}catch(e){errors.push(e.message)}}else{const local=await readCachedFiles(dest);preparedUploads[dest]=Array.isArray(local)&&local.length?local:[]}}
if(preparedUploads.dpiFront[0]){q("#prevDpiFront").innerHTML='<img src="'+objUrl(preparedUploads.dpiFront[0])+'">';q("#metaDpiFront").textContent="Guardado: "+preparedUploads.dpiFront[0].name}else{q("#prevDpiFront").innerHTML='<span class="muted">DPI frente no almacenado</span>';q("#metaDpiFront").textContent="Sin archivo guardado · vuelve a subirlo si necesitas editar"}
if(preparedUploads.dpiBack[0]){q("#prevDpiBack").innerHTML='<img src="'+objUrl(preparedUploads.dpiBack[0])+'">';q("#metaDpiBack").textContent="Guardado: "+preparedUploads.dpiBack[0].name}else{q("#prevDpiBack").innerHTML='<span class="muted">DPI reverso no almacenado</span>';q("#metaDpiBack").textContent="Sin archivo guardado · vuelve a subirlo si necesitas editar"}
if(errors.length)q("#extractMsg").innerHTML='<div class="notice warning"><strong>Algunas fotos del DPI no pudieron recuperarse:</strong><br>'+errors.map(esc).join("<br>")+'</div>';updateButtons()}
function stage2StoredGroups(rec){return rec?.stage2_documents||{selfie:[],utility:[],income:[]}}
async function storedDocToFile(meta){return storedCaseDocToFile(meta)}
async function restoreServerStage2Documents(rec){const groups=stage2StoredGroups(rec),errors=[];for(const [dest,src] of [["stage2Selfie","selfie"],["stage2Utility","utility"],["stage2Income","income"]]){const metas=Array.isArray(groups[src])?groups[src]:[];if(!metas.length){preparedUploads[dest]=[];continue}const files=[];for(const meta of metas){try{files.push(await storedDocToFile(meta))}catch(e){errors.push(e.message)}}preparedUploads[dest]=files;if(files.length)await cacheFiles(dest,files)}if(preparedUploads.stage2Selfie[0]){q("#prevStage2Selfie").innerHTML='<img src="'+objUrl(preparedUploads.stage2Selfie[0])+'">';q("#metaStage2Selfie").textContent=preparedUploads.stage2Selfie[0].name}else{q("#prevStage2Selfie").innerHTML='<span class="muted">Pendiente</span>';q("#metaStage2Selfie").textContent="Sin archivo"}await renderMulti(q("#previewStage2Utility"),preparedUploads.stage2Utility);await renderMulti(q("#previewStage2Income"),preparedUploads.stage2Income);q("#metaStage2Utility").textContent=preparedUploads.stage2Utility.length?preparedUploads.stage2Utility.map(f=>f.name).join(" · "):"Sin archivo";q("#metaStage2Income").textContent=preparedUploads.stage2Income.length?preparedUploads.stage2Income.map(f=>f.name).join(" · "):"Sin archivo";if((rec?.stage2_draft?.extraction||rec?.stage2?.extraction)&&stage2Signature())stage2AnalyzedSignature=stage2Signature();if(errors.length)q("#stage2ExtractMsg").innerHTML='<div class="notice warning"><strong>Algunos documentos no pudieron recuperarse:</strong><br>'+errors.map(esc).join("<br>")+'</div>';updateButtons()}
function applyStoredStage2Extraction(rec){const ex=rec?.stage2?.extraction||rec?.stage2_draft?.extraction||null;if(!ex)return;stage2Extraction=ex;if(!rec?.stage2?.data)applyExtraction(ex.fields||[],q("#stage2Form"));const sc=ex.selfie_check,dc=ex.domicile_consistency,ic=ex.income_consistency,problem=!sc?.persona_visible||!sc?.dpi_visible_junto_al_rostro||sc?.texto_dpi_comparable==="no_coincide"||dc?.status==="possible_conflict"||ic?.status==="possible_conflict";q("#stage2QualityBadge").className="badge "+(problem?"warn":"ok");q("#stage2QualityBadge").textContent=problem?"Revisar":"Documentos revisados";q("#stage2QualityBox").innerHTML='<div class="notice '+(problem?'warning':'success')+'"><strong>Revisión automática guardada</strong><br>Selfie con DPI: '+(sc?.dpi_visible_junto_al_rostro?'Correcta':'Revisar')+' · Domicilio: '+esc(dc?.status||'insufficient')+' · Ingresos: '+esc(ic?.status||'not_applicable')+'</div>'}

async function resumeDraft(){const raw=localStorage.getItem(DRAFT_KEY);if(!raw||!sellerSession)return;try{const d=JSON.parse(raw);if(d.seller_id&&d.seller_id!==sellerSession.id){alert("Este borrador pertenece a otro vendedor.");return}currentCaseId=d.case_id||crypto.randomUUID();currentSeller=sellerSession.name;currentSellerId=sellerSession.id;if(d.stage1){fillForm(q("#preForm"),d.stage1);syncProductUiFromForm()}if(d.stage2)fillForm(q("#stage2Form"),d.stage2);sentPayload=d.sentPayload||null;requestId=d.requestId||null;stage1Decision=d.stage1Decision||null;await restorePreparedFiles();currentPermissions=d.screen==="screen2"?{edit_stage2:true}:{edit_stage1:true};if(d.screen==="screen2"&&sentPayload){showOnly("screen2");configureStage2();q("#stage2FormCard").classList.remove("hidden");setStageEditable("stage2",true,"")}else{showOnly("screen1");q("#formCard").classList.remove("hidden");setStageEditable("stage1",true,"")}q("#pageTitle").textContent=d.screen==="screen2"?"Solicitud fácil de crédito · Paso 2":"Solicitud fácil de crédito · Paso 1";updateStage1ValidationUI();updateStage2ValidationUI()}catch(e){alert("No se pudo recuperar el borrador: "+e.message)}}

function only4(el){el.value=String(el.value||"").replace(/\D/g,"").slice(0,4)}
async function loadSellerOptions(){try{const r=await fetch("/api/sellers/public"),d=await r.json(),sel=q("#sellerLoginSelect");sel.innerHTML='<option value="">Seleccionar vendedor</option>';for(const v of d.sellers||[]){const o=document.createElement("option");o.value=v.id;o.textContent=v.name;sel.appendChild(o)}}catch{q("#sellerLoginSelect").innerHTML='<option value="">No se pudo cargar</option>'}}
async function checkSellerSession(){try{const r=await fetch("/api/seller/me"),d=await r.json();if(r.ok&&d.ok&&d.seller){sellerSession=d.seller;currentSeller=d.seller.name;currentSellerId=d.seller.id;goHome();return true}}catch{}sellerSession=null;currentSeller="";currentSellerId="";showOnly("screenLogin");return false}
async function sellerLogin(){const seller_id=q("#sellerLoginSelect").value,pin=q("#sellerLoginPin").value;const msg=q("#sellerLoginMsg");if(!seller_id||!/^[0-9]{4}$/.test(pin)){msg.innerHTML='<div class="notice warning">Selecciona vendedor e ingresa un PIN de 4 números.</div>';return}const r=await fetch("/api/seller/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seller_id,pin})}),d=await r.json();if(!r.ok||!d.ok){msg.innerHTML='<div class="notice bad">'+esc(d.error||"No autorizado")+'</div>';return}sellerSession=d.seller;currentSeller=d.seller.name;currentSellerId=d.seller.id;q("#sellerLoginPin").value="";goHome()}
async function registerSeller(){const name=q("#newSellerName").value.trim(),pin=q("#newSellerPin").value,pin2=q("#newSellerPin2").value,msg=q("#registerSellerMsg");if(name.length<3){msg.innerHTML='<div class="notice warning">Escribe tu nombre completo.</div>';return}if(!/^[0-9]{4}$/.test(pin)||pin!==pin2){msg.innerHTML='<div class="notice warning">El PIN debe tener exactamente 4 números y coincidir.</div>';return}const r=await fetch("/api/seller/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,pin})}),d=await r.json();if(!r.ok||!d.ok){msg.innerHTML='<div class="notice bad">'+esc(d.error||"No se pudo crear el vendedor")+'</div>';return}sellerSession=d.seller;currentSeller=d.seller.name;currentSellerId=d.seller.id;await loadSellerOptions();goHome()}
async function sellerLogout(){await fetch("/api/seller/logout",{method:"POST"});sellerSession=null;currentSeller="";currentSellerId="";currentCaseId=null;showOnly("screenLogin");q("#pageTitle").textContent="CrediZas · Acceso de vendedor";q("#pageSubtitle").textContent="Ingresa con tu nombre y PIN.";await loadSellerOptions()}
function actionForCase(c){if(c.estado==="RECHAZADA")return{label:"Ver · Cerrada",edit:false};if(c.proceso==="FORMALIZACION DE CREDITO"&&!c.tiene_paso2)return{label:"Completar Paso 2",edit:true};if(c.estado==="REQUIERE DATOS")return{label:"Editar información",edit:true};return{label:"Ver",edit:false}}
async function loadSellerCases(){if(!sellerSession)return;const term=q("#caseSearchInput")?.value.trim()||"",u=new URL("/api/seller/cases",location.origin);if(term)u.searchParams.set("q",term);const r=await fetch(u,{cache:"no-store"}),d=await r.json(),box=q("#caseSearchResults");if(r.status===401){await sellerLogout();return}if(!r.ok){box.innerHTML='<div class="notice bad">'+esc(d.error||"No se pudo cargar")+'</div>';return}box.innerHTML=(d.cases||[]).length?(d.cases||[]).map(c=>{const a=actionForCase(c),detail=c.estado==="REQUIERE DATOS"&&c.detalle?'<div class="notice warning" style="margin:7px 0 0"><strong>Información solicitada:</strong> '+esc(c.detalle)+'</div>':'';return '<div class="case-row"><div><strong>'+esc(c.nombre||"Sin nombre")+'</strong><span class="muted">DPI '+esc(c.dpi||"")+'</span><div class="case-meta"><span class="seller-process">'+esc(sellerProcessLabel(c.proceso))+'</span><span class="seller-state '+sellerStateClass(c.estado)+'">Estado: '+esc(sellerStateLabel(c.estado))+'</span></div>'+detail+'</div><div class="case-actions"><button type="button" class="'+(a.edit?'yellow':'secondary')+'" data-open-case="'+esc(c.id)+'">'+a.label+'</button></div></div>'}).join(""):'<div class="muted">Todavía no tienes solicitudes.</div>';box.querySelectorAll("[data-open-case]").forEach(b=>b.addEventListener("click",()=>openExistingCase(b.dataset.openCase)))}
async function searchCases(){return loadSellerCases()}
function setStageEditable(stage,editable,requirement){const is1=stage==="stage1",form=is1?q("#preForm"):q("#stage2Form"),notice=is1?q("#stage1AdminNotice"):q("#stage2AdminNotice");if(form)form.querySelectorAll("input,select,textarea").forEach(el=>{if(el.type!=="hidden")el.disabled=!editable});if(is1){["dpiFront","dpiBack"].forEach(id=>{if(q("#"+id))q("#"+id).disabled=!editable});if(q("#analyzeBtn"))q("#analyzeBtn").disabled=!editable;if(q("#submitBtn"))q("#submitBtn").classList.toggle("hidden",!editable)}else{["stage2Selfie","stage2Utility","stage2Income"].forEach(id=>{if(q("#"+id))q("#"+id).disabled=!editable});if(q("#stage2AnalyzeBtn"))q("#stage2AnalyzeBtn").disabled=!editable;if(q("#finalSubmitBtn"))q("#finalSubmitBtn").classList.toggle("hidden",!editable)}if(notice){notice.classList.remove("hidden");notice.innerHTML=editable&&requirement?'<div class="notice warning"><strong>El administrador solicita corregir:</strong><br>'+esc(requirement)+'</div>':editable?'<div class="notice success"><strong>Captura habilitada.</strong> Completa y envía esta etapa.</div>':'<div class="lock-note"><strong>Solo lectura.</strong> El expediente está bloqueado para edición. Solo el administrador puede habilitar correcciones con “Requiere información”.</div>'}}
async function openExistingCase(id){
  const endpoint=adminMode?"/api/admin/cases/"+encodeURIComponent(id):"/api/seller/cases/"+encodeURIComponent(id);
  const r=await fetch(endpoint,{cache:"no-store"}),d=await r.json();
  if(!r.ok||!d.case){alert(d.error||"No se pudo abrir");if(adminMode&&r.status===401)location.href="/admin";return}
  const rec=d.case;currentRecordState=rec;currentPermissions=adminMode?{edit_stage1:rec.estado!=="RECHAZADA",start_stage2:rec.estado!=="RECHAZADA",edit_stage2:rec.estado!=="RECHAZADA",requirement:rec.ultimo_requerimiento||"",closed:rec.estado==="RECHAZADA"}:(d.permissions||{});currentCaseId=rec.id;currentSeller=rec.vendedor||sellerSession?.name||"";currentSellerId=rec.vendedor_id||sellerSession?.id||"";if(adminMode)sellerSession={id:currentSellerId,name:currentSeller};sentPayload=rec.stage1?.data||null;requestId=rec.stage1?.request_id||null;stage1Decision=rec.stage1?.decision||null;
  if(sentPayload){fillForm(q("#preForm"),sentPayload);syncProductUiFromForm()}
  await restoreServerStage1Documents(rec);
  q("#cancelEditStage1")?.classList.remove("hidden");q("#cancelEditStage2")?.classList.remove("hidden");
  const closed=rec.estado==="RECHAZADA";
  if(rec.proceso==="FORMALIZACION DE CREDITO"){
    showOnly("screen2");configureStage2();q("#stage2FormCard").classList.remove("hidden");
    if(rec.stage2?.data){fillForm(q("#stage2Form"),rec.stage2.data);q("#stage2Verified").checked=Boolean(rec.stage2.data?.control?.revision_humana)}
    applyStoredStage2Extraction(rec);
    await restoreServerStage2Documents(rec);
    setStageEditable("stage2",adminMode?!closed:Boolean(currentPermissions.start_stage2||currentPermissions.edit_stage2),adminMode?(closed?"Expediente rechazado y cerrado. Cambia el estado desde Administración para reabrirlo.":"Edición administrativa habilitada."):(currentPermissions.requirement||""));
    q("#pageTitle").textContent=adminMode?"CrediZas · Editar Formalización":"Solicitud fácil de crédito · Paso 2";q("#stage2AccessNotice").innerHTML=currentPermissions.requirement?'<div class="notice warning"><strong>Corrección solicitada:</strong> '+esc(currentPermissions.requirement)+'</div>':'';
  }else{
    showOnly("screen1");q("#formCard").classList.remove("hidden");setStageEditable("stage1",adminMode?!closed:Boolean(currentPermissions.edit_stage1),adminMode?(closed?"Expediente rechazado y cerrado. Cambia el estado desde Administración para reabrirlo.":"Edición administrativa habilitada."):(currentPermissions.requirement||""));q("#pageTitle").textContent=adminMode?"CrediZas · Editar Precalificación":"Solicitud fácil de crédito · Paso 1";
  }
  q("#pageSubtitle").textContent=adminMode?"Administración · "+currentSeller:"Revisa los datos del expediente.";updateStage1ValidationUI();updateStage2ValidationUI();
}

async function checkAdminWorkspace(){if(!adminMode)return false;const me=await fetch("/api/admin/me");if(!me.ok){location.href="/admin";return true}const sellersRes=await fetch("/api/admin/sellers"),sellersData=await sellersRes.json();if(adminCaseId){await openExistingCase(adminCaseId);q("#backHomeAfterStage1").textContent="Volver a Administración";return true}const seller=(sellersData.sellers||[]).find(x=>String(x.id)===String(adminSellerId));if(!seller){alert("Selecciona un vendedor desde el panel administrador.");location.href="/admin";return true}sellerSession=seller;currentSeller=seller.name;currentSellerId=seller.id;await clearCachedFiles();q("#preForm").reset();q("#stage2Form")?.reset();q("#selectedProduct")?.classList.add("hidden");q("#productSearch").value="";for(const k of Object.keys(preparedUploads))preparedUploads[k]=[];currentCaseId=crypto.randomUUID();sentPayload=null;requestId=null;stage1Decision=null;stage2Extraction=null;currentRecordState=null;currentPermissions={edit_stage1:true};showOnly("screen1");q("#cancelEditStage1")?.classList.add("hidden");q("#cancelEditStage2")?.classList.add("hidden");setStageEditable("stage1",true,"Edición administrativa habilitada.");q("#pageTitle").textContent="CrediZas · Nueva solicitud";q("#pageSubtitle").textContent="Administrador · Vendedor: "+seller.name;q("#backHomeAfterStage1").textContent="Volver a Administración";return true}

function productCardHtml(name,sku,image,amount){const img=image?'<img src="'+esc(image)+'" alt="Producto">':'<div style="width:92px;height:92px;border:1px solid #d8e5dc;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;color:#98a2b3;font-weight:800">Sin imagen</div>';return '<div class="selected-product-card">'+img+'<div><div class="sp-name">'+esc(name||"")+'</div><div class="sp-sku">SKU: '+esc(sku||"N/D")+'</div><div class="sp-amount">Monto solicitado: '+catalogMoney(amount)+'</div></div></div>'}
function syncProductUiFromForm(){const name=q('[name="solicitud.producto_solicitado"]')?.value||"",sku=q('[name="solicitud.producto_sku"]')?.value||"",image=q('[name="solicitud.producto_imagen_url"]')?.value||"",amount=Number(q('[name="solicitud.monto_total_solicitado"]')?.value||0);if(!name)return;q("#productSearch").value=name;q("#selectedProduct").classList.remove("hidden");q("#selectedProduct").innerHTML=productCardHtml(name,sku,image,amount)}
let catalogTimer=null;
function catalogMoney(v){return "Q "+Number(v||0).toLocaleString("es-GT",{minimumFractionDigits:2,maximumFractionDigits:2})}
async function searchCatalog(qry){const box=q("#productResults");if(!qry||qry.length<2){box.classList.add("hidden");return}const r=await fetch("/api/catalog?q="+encodeURIComponent(qry)),d=await r.json();if(!r.ok){box.innerHTML='<div class="notice bad">'+esc(d.error||"No se pudo consultar catálogo")+'</div>';box.classList.remove("hidden");return}const items=(d.data||[]).slice(0,20);box.innerHTML=items.length?items.map((p,i)=>'<div class="product-option" data-product-index="'+i+'">'+(p.imagen_principal_url?'<img src="'+esc(p.imagen_principal_url)+'" alt="">':'<div></div>')+'<div><div class="po-name">'+esc(p.nombre)+'</div><div class="po-meta">'+esc(p.sku||"")+" · "+esc(p.categoria||"")+'</div></div><div></div></div>').join(""):'<div class="notice">No se encontraron productos.</div>';box.classList.remove("hidden");box.querySelectorAll("[data-product-index]").forEach(el=>el.addEventListener("click",()=>selectCatalogProduct(items[Number(el.dataset.productIndex)])))}
function selectCatalogProduct(p){q('[name="solicitud.producto_solicitado"]').value=p.nombre||p.descripcion||"";q('[name="solicitud.producto_id"]').value=p.producto_id||"";q('[name="solicitud.producto_sku"]').value=p.sku||"";q('[name="solicitud.producto_imagen_url"]').value=p.imagen_principal_url||"";q('[name="solicitud.monto_total_solicitado"]').value=Number(p.monto_solicitado||0).toFixed(2);q("#productSearch").value=p.nombre||"";q("#selectedProduct").classList.remove("hidden");q("#selectedProduct").innerHTML=productCardHtml(p.nombre||"",p.sku||"",p.imagen_principal_url||"",Number(p.monto_solicitado||0));q("#productResults").classList.add("hidden");updateStage1ValidationUI();saveDraftSoon()}

const objectUrls=[];
function esc(v){return String(v??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[s]));}
function setProgress(n,state){for(let i=1;i<=4;i++){const e=q("#p"+i);if(!e)continue;e.className="pstep";if(i<n)e.classList.add("done");if(i===n)e.classList.add(state==="blocked"?"blocked":"active");}}
function goScreen2(){q("#screen1").classList.add("hidden");q("#screen2").classList.remove("hidden");q("#pageTitle").textContent="Solicitud fácil de crédito · Paso 2";q("#pageSubtitle").textContent="Ahora pide solo los documentos y datos que faltan.";configureStage2();window.scrollTo({top:0,behavior:"smooth"});}
function ext(name){const m=String(name||"").toLowerCase().match(/\.([a-z0-9]+)$/);return m?m[1]:"";}
function isPdf(file){return file?.type==="application/pdf"||ext(file?.name)==="pdf";}
function isImage(file){return String(file?.type||"").startsWith("image/")||["jpg","jpeg","png","webp","gif","bmp","tif","tiff","heic","heif","avif","jxl"].includes(ext(file?.name));}
async function decodeImage(file){try{const b=await createImageBitmap(file);return{width:b.width,height:b.height,draw(c,w,h){c.drawImage(b,0,0,w,h)},close(){b.close?.()}}}catch{}return await new Promise((resolve,reject)=>{const u=URL.createObjectURL(file),img=new Image();img.onload=()=>resolve({width:img.naturalWidth||img.width,height:img.naturalHeight||img.height,draw(c,w,h){c.drawImage(img,0,0,w,h)},close(){URL.revokeObjectURL(u)}});img.onerror=()=>{URL.revokeObjectURL(u);reject(new Error("El navegador no pudo abrir "+file.name+". Usa JPG, PNG, WEBP o PDF."))};img.src=u})}
async function prepareImage(file){const d=await decodeImage(file),max=2200,scale=Math.min(1,max/Math.max(d.width,d.height)),w=Math.max(1,Math.round(d.width*scale)),h=Math.max(1,Math.round(d.height*scale)),c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d",{alpha:false});if(!ctx){d.close();throw new Error("No se pudo preparar la imagen.")}ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);d.draw(ctx,w,h);d.close();const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.9));if(!blob)throw new Error("No se pudo convertir "+file.name);const base=(file.name||"imagen").replace(/\.[^.]+$/,"" )||"imagen";return new File([blob],base+".jpg",{type:"image/jpeg",lastModified:Date.now()})}
async function prepareFiles(files){const out=[];for(const f of files){out.push(isImage(f)?await prepareImage(f):f)}return out;}
function objUrl(f){const u=URL.createObjectURL(f);objectUrls.push(u);return u;}
function isWord(f){return ["doc","docx"].includes(ext(f?.name))||["application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(String(f?.type||""));}
const wordHtmlCache=new Map();
async function wordHtml(f){if(wordHtmlCache.has(f))return wordHtmlCache.get(f);let value="";if(ext(f?.name)==="docx"&&window.mammoth){try{const arrayBuffer=await f.arrayBuffer();const result=await window.mammoth.convertToHtml({arrayBuffer:arrayBuffer});value=result.value||""}catch(e){value=""}}wordHtmlCache.set(f,value);return value;}
async function previewCard(f){const name=esc(f.name);if(String(f.type||"").startsWith("image/")){return '<div class="doc-preview-card"><div class="doc-preview-head">'+name+'</div><div class="doc-preview-body"><img src="'+objUrl(f)+'"></div><div class="doc-preview-foot">Imagen</div></div>'}if(isPdf(f)){return '<div class="doc-preview-card"><div class="doc-preview-head">'+name+'</div><div class="doc-preview-body"><iframe src="'+objUrl(f)+'#toolbar=0"></iframe></div><div class="doc-preview-foot">PDF</div></div>'}if(isWord(f)){const wh=await wordHtml(f);const body=wh?'<div class="word-preview">'+wh+'</div>':'<div class="word-fallback"><strong>WORD</strong><span>'+name+'</span></div>';return '<div class="doc-preview-card"><div class="doc-preview-head">'+name+'</div><div class="doc-preview-body">'+body+'</div><div class="doc-preview-foot">Documento Word</div></div>'}return '<div class="doc-preview-card"><div class="doc-preview-head">'+name+'</div><div class="doc-preview-body"><div class="word-fallback"><strong>DOCUMENTO</strong><span>'+name+'</span></div></div><div class="doc-preview-foot">Documento</div></div>'}
async function renderMulti(container,files){if(!files.length){container.innerHTML='<span class="muted">Sin archivos</span>';return}const cards=[];for(const f of files)cards.push(await previewCard(f));container.innerHTML=cards.join("");}
async function handleSingleImage(input,key,box,meta){const f=input.files?.[0];if(!f){preparedUploads[key]=[];await cacheFiles(key,[]);if(key.startsWith("stage2"))invalidateStage2Analysis();box.innerHTML='<span class="muted">Pendiente</span>';meta.textContent="Sin archivo";updateButtons();saveDraftSoon();return}meta.textContent="Preparando...";try{const p=await prepareImage(f);preparedUploads[key]=[p];await cacheFiles(key,[p]);if(key.startsWith("stage2"))invalidateStage2Analysis();box.innerHTML='<img src="'+objUrl(p)+'">';meta.textContent=f.name}catch(e){preparedUploads[key]=[];box.innerHTML='<div class="notice bad">'+esc(e.message)+'</div>'}updateButtons();saveDraftSoon();}
async function handleMulti(input,key,meta,container){const fs=[...(input.files||[])];if(!fs.length){preparedUploads[key]=[];await cacheFiles(key,[]);if(key.startsWith("stage2"))invalidateStage2Analysis();meta.textContent="Sin archivo";await renderMulti(container,[]);updateButtons();saveDraftSoon();return}meta.textContent="Preparando...";try{const ps=await prepareFiles(fs);preparedUploads[key]=ps;await cacheFiles(key,ps);if(key.startsWith("stage2"))invalidateStage2Analysis();meta.textContent=ps.map(f=>f.name).join(", ");await renderMulti(container,ps)}catch(e){preparedUploads[key]=[];container.innerHTML='<div class="notice bad">'+esc(e.message)+'</div>'}updateButtons();saveDraftSoon();}
q("#dpiFront").addEventListener("change",e=>handleSingleImage(e.target,"dpiFront",q("#prevDpiFront"),q("#metaDpiFront")));
q("#dpiBack").addEventListener("change",e=>handleSingleImage(e.target,"dpiBack",q("#prevDpiBack"),q("#metaDpiBack")));
q("#stage2Selfie").addEventListener("change",e=>handleSingleImage(e.target,"stage2Selfie",q("#prevStage2Selfie"),q("#metaStage2Selfie")));
q("#stage2Utility").addEventListener("change",e=>handleMulti(e.target,"stage2Utility",q("#metaStage2Utility"),q("#previewStage2Utility")));
q("#stage2Income").addEventListener("change",e=>handleMulti(e.target,"stage2Income",q("#metaStage2Income"),q("#previewStage2Income")));

q("#homeBtn")?.addEventListener("click",goHome);
q("#sellerLoginPin")?.addEventListener("input",e=>only4(e.target));q("#newSellerPin")?.addEventListener("input",e=>only4(e.target));q("#newSellerPin2")?.addEventListener("input",e=>only4(e.target));
q("#sellerLoginBtn")?.addEventListener("click",sellerLogin);q("#registerSellerBtn")?.addEventListener("click",registerSeller);q("#sellerLogoutBtn")?.addEventListener("click",sellerLogout);
q("#newCaseBtn")?.addEventListener("click",async()=>{if(!sellerSession)return;await clearCachedFiles();q("#preForm").reset();q("#stage2Form")?.reset();q("#selectedProduct")?.classList.add("hidden");q("#productSearch").value="";for(const k of Object.keys(preparedUploads))preparedUploads[k]=[];currentCaseId=crypto.randomUUID();currentSeller=sellerSession.name;currentSellerId=sellerSession.id;sentPayload=null;requestId=null;stage1Decision=null;stage2Extraction=null;currentRecordState=null;currentPermissions={edit_stage1:true};stage2AnalyzedSignature="";showOnly("screen1");q("#cancelEditStage1")?.classList.add("hidden");q("#cancelEditStage2")?.classList.add("hidden");setStageEditable("stage1",true,"");q("#pageTitle").textContent="Solicitud fácil de crédito · Paso 1";q("#pageSubtitle").textContent="Sube el DPI, revisa los datos y completa lo que falta.";saveDraftSoon()});
q("#caseSearchBtn")?.addEventListener("click",searchCases);q("#caseSearchInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")searchCases()});q("#resumeDraftBtn")?.addEventListener("click",resumeDraft);q("#backHomeAfterStage1")?.addEventListener("click",goHome);
q("#productSearch")?.addEventListener("input",e=>{clearTimeout(catalogTimer);catalogTimer=setTimeout(()=>searchCatalog(e.target.value.trim()),250)});
document.addEventListener("click",e=>{if(!e.target.closest(".product-search-wrap"))q("#productResults")?.classList.add("hidden")});
q("#preForm")?.addEventListener("input",saveDraftSoon);q("#preForm")?.addEventListener("change",saveDraftSoon);q("#stage2Form")?.addEventListener("input",saveDraftSoon);q("#stage2Form")?.addEventListener("change",saveDraftSoon);

function updateButtons(){const ready1=preparedUploads.dpiFront.length===1&&preparedUploads.dpiBack.length===1,canEdit1=!currentRecordState||Boolean(currentPermissions.edit_stage1);q("#analyzeBtn").disabled=!ready1||!canEdit1;q("#uploadStatus").className="notice "+(ready1?"success":"warning");q("#uploadStatus").innerHTML=ready1?"<strong>¡Muy bien!</strong> Ya puedes leer los datos del DPI.":"Sube primero las dos fotos del DPI: enfrente y atrás.";if(sentPayload){const pol=stage2Policy(),ready2=preparedUploads.stage2Selfie.length===1&&preparedUploads.stage2Utility.length>=1&&(!pol.required||preparedUploads.stage2Income.length>=1),same=ready2&&stage2AnalyzedSignature&&stage2AnalyzedSignature===stage2Signature(),canEdit2=Boolean(currentPermissions.start_stage2||currentPermissions.edit_stage2);q("#stage2AnalyzeBtn").disabled=!ready2||same||!canEdit2;const missing=[];if(!preparedUploads.stage2Selfie.length)missing.push("selfie con DPI");if(!preparedUploads.stage2Utility.length)missing.push("documento de domicilio");if(pol.required&&!preparedUploads.stage2Income.length)missing.push("sustento de ingresos");q("#stage2DocsStatus").className="notice "+(ready2?"success":"warning");q("#stage2DocsStatus").innerHTML=same?"<strong>Documentos ya leídos.</strong> El botón se habilitará de nuevo si cargas o cambias algún archivo.":ready2?"<strong>Documentos completos.</strong> Ya puedes leerlos con IA.":"<strong>Falta:</strong> "+missing.join(" · ");}}
const incomeRules={SALARIO:{origins:["SALARIO FORMAL","SALARIO INFORMAL"],subtype:{"SALARIO FORMAL":"CON DESCUENTO IGSS","SALARIO INFORMAL":"SIN DESCUENTO IGSS"}},RENTAS:{origins:["REMESAS","JUBILADO"],subtype:{REMESAS:"REMESAS",JUBILADO:"JUBILADO"}},VENTAS:{origins:["INDEPENDIENTE FORMAL","INDEPENDIENTE INFORMAL"],subtype:{"INDEPENDIENTE FORMAL":"AMBULANTE","INDEPENDIENTE INFORMAL":"OFICIO MENOR"}}};
function rebuildIncomeOrigin(){const s=q('[name="informacion_complementaria.fuente_ingresos"]'),o=q('[name="informacion_complementaria.origen_ingresos"]'),t=q('[name="informacion_complementaria.subtipo_ingreso"]');o.innerHTML='<option value="">Seleccionar</option>';t.innerHTML='<option value="">Seleccionar origen primero</option>';const r=incomeRules[s.value];r?.origins.forEach(v=>{const x=document.createElement("option");x.value=v;x.textContent=v;o.appendChild(x)})}
function rebuildIncomeSubtype(){const s=q('[name="informacion_complementaria.fuente_ingresos"]').value,o=q('[name="informacion_complementaria.origen_ingresos"]').value,t=q('[name="informacion_complementaria.subtipo_ingreso"]');t.innerHTML='<option value="">Seleccionar</option>';const v=incomeRules[s]?.subtype?.[o];if(v){const x=document.createElement("option");x.value=v;x.textContent=v;t.appendChild(x);t.value=v}}
q('[name="informacion_complementaria.fuente_ingresos"]').addEventListener("change",rebuildIncomeOrigin);q('[name="informacion_complementaria.origen_ingresos"]').addEventListener("change",rebuildIncomeSubtype);
q("#preForm").addEventListener("input",updateStage1ValidationUI);q("#preForm").addEventListener("change",updateStage1ValidationUI);q("#stage2Form").addEventListener("input",updateStage2ValidationUI);q("#stage2Form").addEventListener("change",updateStage2ValidationUI);
function setDeep(obj,path,value){const parts=path.split(".");let cur=obj;for(let i=0;i<parts.length;i++){const k=parts[i],last=i===parts.length-1,next=parts[i+1],nextIndex=next!==undefined&&/^\d+$/.test(next);if(last){cur[k]=value;return}if(cur[k]===undefined)cur[k]=nextIndex?[]:{};if(nextIndex){const n=Number(next);if(!cur[k][n])cur[k][n]={};cur=cur[k][n];i++}else cur=cur[k]}}
function collect(form){const out={};form.querySelectorAll("[name]").forEach(el=>{let v=el.value;if(v==="")v=null;else if(el.type==="number")v=Number(v);setDeep(out,el.name,v)});return out;}
function applyExtraction(fields,form){for(const item of fields||[]){const el=form.querySelector('[name="'+CSS.escape(item.key)+'"]');if(!el)continue;const v=item.normalized_value??item.value??"";if(v!==null&&v!==undefined)el.value=el.type==="tel"?digits8(v):v;const wrap=el.closest(".field");if(wrap){wrap.classList.remove("ai-found","ai-uncertain","ai-conflict");wrap.classList.add(item.status==="conflict"?"ai-conflict":item.status==="uncertain"?"ai-uncertain":"ai-found");const m=wrap.querySelector(".field-meta");if(m)m.textContent=(item.status==="found"?"IA ":"Revisar ")+Math.round((item.confidence||0)*100)+"%"}}}
const STAGE1_REQUIRED=[
  "datos_basicos.nombre_completo","datos_basicos.numero_dpi","datos_basicos.fecha_nacimiento","datos_basicos.nit","datos_basicos.numero_celular","datos_basicos.estado_civil","datos_basicos.genero",
  "solicitud.producto_solicitado","solicitud.monto_total_solicitado","informacion_complementaria.ingreso_promedio_mensual","informacion_complementaria.fuente_ingresos","informacion_complementaria.origen_ingresos","informacion_complementaria.subtipo_ingreso","informacion_complementaria.tipo_vivienda","informacion_complementaria.departamento","informacion_complementaria.municipio","informacion_complementaria.nivel_educacion"
];
function fieldLabel(el){return el?.closest(".field")?.querySelector("label")?.textContent?.replace(/\s*\*\s*$/,"" ).trim()||el?.name||"Campo";}
function fieldValid(el,name){if(!el)return false;const v=String(el.value??"").trim();if(!v)return false;if(el.type==="number")return Number(v)>0;if(el.type==="tel")return validPhone(v);return true;}
function paintField(el,valid){const f=el?.closest(".field");if(!f)return;f.classList.toggle("valid-state",!!valid);f.classList.toggle("invalid-state",!valid);}
function updateStage1ValidationUI(){const missing=[];for(const name of STAGE1_REQUIRED){const el=q('[name="'+CSS.escape(name)+'"]'),ok=fieldValid(el,name);paintField(el,ok);if(!ok)missing.push(fieldLabel(el))}const estado=q('[name="datos_basicos.estado_civil"]')?.value||"",spouse=q('[name="datos_basicos.nombre_conyuge"]');if(estado==="CASADO"){const ok=fieldValid(spouse,"datos_basicos.nombre_conyuge");paintField(spouse,ok);if(!ok)missing.push("Nombre del cónyuge")}else if(spouse){spouse.closest(".field")?.classList.remove("invalid-state","valid-state")}const box=q("#stage1ValidationBox");if(box){box.className="validation-box"+(missing.length?"":" ok");box.innerHTML=missing.length?"<strong>Información faltante:</strong> "+missing.map(esc).join(" · "):"<strong>✓ Datos completos.</strong> Ya puedes enviar el Paso 1."}return missing;}
function stage2RequiredNames(){const base=["domicilio.direccion_completa"];const work=stage2Group()==="company"?["digitacion.nombre_empresa","digitacion.direccion_empresa","digitacion.telefono_empresa","digitacion.antiguedad"]:["digitacion.giro_oficio","digitacion.direccion_empresa","digitacion.telefono_empresa","digitacion.antiguedad"];const refs=[];for(let i=0;i<3;i++)refs.push("referencias."+i+".nombre_completo","referencias."+i+".parentesco","referencias."+i+".celular");return base.concat(work,refs);}
function updateStage2ValidationUI(){const missing=[];for(const name of stage2RequiredNames()){const el=q('#stage2Form [name="'+CSS.escape(name)+'"]'),ok=fieldValid(el,name);paintField(el,ok);if(!ok)missing.push(fieldLabel(el))}const box=q("#stage2ValidationBox");if(box){box.className="validation-box"+(missing.length?"":" ok");box.innerHTML=missing.length?"<strong>Información faltante:</strong> "+missing.map(esc).join(" · "):"<strong>✓ Datos completos.</strong> El expediente está listo para revisar y enviar."}return missing;}
function stage2Policy(){const s=sentPayload?.informacion_complementaria?.fuente_ingresos,o=sentPayload?.informacion_complementaria?.origen_ingresos;if(s==="SALARIO"&&o==="SALARIO FORMAL")return{required:true,label:"Pide constancia/carta laboral, boleta u otro respaldo."};if(s==="RENTAS"&&o==="JUBILADO")return{required:true,label:"Pide constancia o comprobante de jubilación/pensión."};if(s==="VENTAS"&&o==="INDEPENDIENTE FORMAL")return{required:true,label:"Constancia de ingresos obligatoria."};if(s==="VENTAS"&&o==="INDEPENDIENTE INFORMAL")return{required:false,label:"No presenta sustento de ingresos."};if(s==="SALARIO"&&o==="SALARIO INFORMAL")return{required:false,label:"No requiere constancia de ingresos."};if(s==="RENTAS"&&o==="REMESAS")return{required:false,label:"No requiere constancia de ingresos."};return{required:false,label:"No se requiere sustento."}}
function stage2Group(){const s=sentPayload?.informacion_complementaria?.fuente_ingresos,o=sentPayload?.informacion_complementaria?.origen_ingresos;return (s==="SALARIO"&&o==="SALARIO FORMAL")||(s==="RENTAS"&&o==="JUBILADO")?"company":"activity";}
function configureStage2(){const c=sentPayload?.informacion_complementaria||{},p=stage2Policy(),g=stage2Group();q("#stage2Summary").innerHTML='<div class="summary-chip"><strong>Ingresos</strong><br>'+esc(c.fuente_ingresos||"")+" → "+esc(c.origen_ingresos||"")+" → "+esc(c.subtipo_ingreso||"")+'</div><div class="summary-chip"><strong>Ingreso promedio mensual</strong><br>Q '+esc(c.ingreso_promedio_mensual??"")+'</div><div class="summary-chip"><strong>Regla de sustento</strong><br>'+esc(p.label)+'</div>';q("#stage2IncomeTitle").textContent=p.required?"SUSTENTO DE INGRESOS *":"SUSTENTO DE INGRESOS · NO OBLIGATORIO";q("#stage2IncomeHelp").textContent=p.label;q("#companyGroup").classList.toggle("hidden",g!=="company");q("#activityGroup").classList.toggle("hidden",g!=="activity");if(g==="company"){const o=c.origen_ingresos;q("#companyGroupTitle").textContent=o==="JUBILADO"?"Datos de institución / jubilación":"Datos de la empresa";q("#companyGuide").textContent=o==="JUBILADO"?"Pregunta nombre de institución/entidad, dirección, teléfono y tiempo como jubilado.":"Pregunta nombre de empresa, dirección, teléfono y antigüedad laboral."}if(g==="activity"){const d=q('[name="digitacion.direccion_empresa"]'),t=q('[name="digitacion.telefono_empresa"]');if(d&&!d.value)d.placeholder="Si no tiene local, usa el domicilio del cliente";if(t&&!t.value)t.value=sentPayload?.datos_basicos?.numero_celular||""}updateButtons();updateStage2ValidationUI();}
function buildStage1Payload(){const p=collect(q("#preForm"));p.expediente={id:currentCaseId||crypto.randomUUID(),vendedor:currentSeller||sellerSession?.name||"",vendedor_id:currentSellerId||sellerSession?.id||""};delete p.control_etapa1;currentCaseId=p.expediente.id;currentSeller=p.expediente.vendedor;p.documentos={dpi_foto:preparedUploads.dpiFront[0]?.name||null,dpi_reverso:preparedUploads.dpiBack[0]?.name||null};p.control={revision_humana:q("#verified").checked,dpi_calidad:extracted?.dpi_quality||null,advertencias_ia:extracted?.warnings||[]};return p;}
function validateRefs(p){const refs=p.referencias||[];if(refs.length<3)return"Debes completar las 3 referencias.";for(let i=0;i<3;i++){const r=refs[i]||{},n=i+1;if(!r.nombre_completo||!r.parentesco||!r.celular)return"Referencia "+n+": completa nombre, parentesco y celular.";if(!validPhone(r.celular))return"Referencia "+n+": el celular debe tener exactamente 8 dígitos.";const rel=String(r.parentesco).toUpperCase();if(rel.includes("CONYUGE")||rel.includes("CÓNYUGE")||rel.includes("ESPOS"))return"Referencia "+n+": el cónyuge no puede ser referencia.";if(r.mayor_edad_confirmado!=="SI"||r.mismo_domicilio!=="NO"||r.certifica_datos!=="SI"||r.localizable!=="SI")return"Referencia "+n+": no cumple las reglas obligatorias de referencia."}return null;}
function buildStage2Payload(){const p=collect(q("#stage2Form"));p.expediente={id:currentCaseId,vendedor:currentSeller||sellerSession?.name||"",vendedor_id:currentSellerId||sellerSession?.id||""};delete p.control_etapa2;p.documentos={selfie_con_dpi:preparedUploads.stage2Selfie[0]?.name||null,domicilio:preparedUploads.stage2Utility.map(f=>f.name),sustento_ingresos:preparedUploads.stage2Income.map(f=>f.name)};p.control={revision_humana:q("#stage2Verified").checked,selfie_check:stage2Extraction?.selfie_check||null,domicile_consistency:stage2Extraction?.domicile_consistency||null,income_consistency:stage2Extraction?.income_consistency||null,advertencias_ia:stage2Extraction?.warnings||[]};return p;}
function requirePdfLibraries(){if(!window.jspdf||!window.jspdf.jsPDF)throw new Error("No se pudo cargar el generador PDF. Revisa la conexión a Internet e intenta de nuevo.");if(window.pdfjsLib)window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";}
function pdfValue(v){if(v===null||v===undefined||v==="")return "No indicado";return String(v);}
function pdfMoney(v){const n=Number(v);return Number.isFinite(n)?"Q "+n.toLocaleString("es-GT",{minimumFractionDigits:2,maximumFractionDigits:2}):pdfValue(v);}
function pdfClientName(v){return String(v||"cliente").replace(/[<>:"/\\|?*\u0000-\u001F]/g," ").replace(/\s+/g," ").trim()||"cliente";}
function pdfToday(){const d=new Date(),p=n=>String(n).padStart(2,"0");return p(d.getDate())+"/"+p(d.getMonth()+1)+"/"+d.getFullYear();}
function pdfHeader(doc,title){doc.setFillColor(24,111,122);doc.rect(0,0,210,25,"F");doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(19);doc.text("CrediZas",12,10);doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.text(title,12,17);doc.text("Fecha: "+pdfToday(),198,10,{align:"right"});doc.setTextColor(23,32,51);return 31;}
function pdfCompactText(doc,value,w){doc.setFont("helvetica","normal");doc.setFontSize(7.2);let lines=doc.splitTextToSize(pdfValue(value),w-6);if(lines.length>3){lines=lines.slice(0,3);let last=String(lines[2]);if(last.length>3)last=last.slice(0,-3)+"...";lines[2]=last}return lines;}
function pdfCompactCard(doc,label,value,x,y,w,h=13){doc.setFillColor(247,250,252);doc.setDrawColor(211,222,230);doc.roundedRect(x,y,w,h,1.2,1.2,"FD");doc.setFont("helvetica","bold");doc.setFontSize(5.8);doc.setTextColor(99,115,129);doc.text(String(label).toUpperCase(),x+3,y+3.8);doc.setTextColor(23,32,51);const lines=pdfCompactText(doc,value,w);doc.text(lines,x+3,y+7.2,{lineHeightFactor:1});}
function pdfCompactSection(doc,title,fields,y){doc.setFont("helvetica","bold");doc.setFontSize(8.6);doc.setTextColor(24,111,122);doc.text(title,12,y);doc.setDrawColor(200,214,224);doc.line(12,y+1.8,198,y+1.8);y+=4.5;const xs=[12,75.5,139],w=59;for(let i=0;i<fields.length;i+=3){let h=13;for(let j=0;j<3;j++){const f=fields[i+j];if(!f)continue;const lines=pdfCompactText(doc,f[1],w);if(lines.length>=3)h=15}for(let j=0;j<3;j++){const f=fields[i+j];if(f)pdfCompactCard(doc,f[0],f[1],xs[j],y,w,h)}y+=h+2}return y+2;}
function pdfFooterOne(doc,page,total){doc.setFont("helvetica","normal");doc.setFontSize(6.5);doc.setTextColor(110,120,130);doc.text("Documento confidencial - Uso interno",12,290);doc.text("Página "+page+" de "+total,198,290,{align:"right"});}
function fileDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("No se pudo leer "+file.name));r.readAsDataURL(file)})}
async function pdfImageBox(doc,file,label,x,y,w,h){doc.setFillColor(247,250,252);doc.setDrawColor(211,222,230);doc.roundedRect(x,y,w,h,1.5,1.5,"FD");doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(99,115,129);doc.text(label,x+4,y+6);if(!file){doc.setFont("helvetica","normal");doc.text("No disponible",x+4,y+14);return}try{const data=await fileDataUrl(file);const props=doc.getImageProperties(data);const maxW=w-8,maxH=h-16,ratio=Math.min(maxW/props.width,maxH/props.height);const iw=props.width*ratio,ih=props.height*ratio;doc.addImage(data,"JPEG",x+(w-iw)/2,y+10+(maxH-ih)/2,iw,ih,undefined,"FAST")}catch(e){doc.setFont("helvetica","normal");doc.setTextColor(180,50,40);doc.text("No se pudo insertar: "+file.name,x+4,y+14)}}
async function pdfAddDpiPage(doc,title){doc.addPage();pdfHeader(doc,title);doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(24,111,122);doc.text("Documento Personal de Identificación",12,34);await pdfImageBox(doc,preparedUploads.dpiFront[0],"DPI - frente",12,40,88,130);await pdfImageBox(doc,preparedUploads.dpiBack[0],"DPI - reverso",110,40,88,130);}
async function renderSourcePdf(file){if(!window.pdfjsLib)return[];const bytes=new Uint8Array(await file.arrayBuffer());const pdf=await window.pdfjsLib.getDocument({data:bytes}).promise;const out=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const viewport=page.getViewport({scale:1.35});const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext("2d"),viewport:viewport}).promise;out.push(canvas.toDataURL("image/jpeg",.9))}return out;}
function pdfAddRenderedPage(doc,data,title,pageLabel){doc.addPage();pdfHeader(doc,title);doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(24,111,122);doc.text(pageLabel,12,34);const props=doc.getImageProperties(data),maxW=186,maxH=244,ratio=Math.min(maxW/props.width,maxH/props.height),w=props.width*ratio,h=props.height*ratio;doc.addImage(data,"JPEG",12+(186-w)/2,39,w,h,undefined,"FAST");}
function htmlToPlainText(html){const d=document.createElement("div");d.innerHTML=html||"";return (d.innerText||d.textContent||"").replace(/\n{3,}/g,"\n\n").trim();}
async function pdfAddWordDocument(doc,file,title,label){doc.addPage();pdfHeader(doc,title);doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(24,111,122);doc.text(label,12,34);doc.setFillColor(236,244,255);doc.setDrawColor(95,145,210);doc.roundedRect(12,39,186,18,2,2,"FD");doc.setFontSize(13);doc.setTextColor(35,90,160);doc.text("WORD",18,50);doc.setFontSize(8);doc.setTextColor(23,32,51);doc.text(file.name,42,49);let body="";if(ext(file.name)==="docx")body=htmlToPlainText(await wordHtml(file));if(!body){doc.setFontSize(8.5);doc.setTextColor(90,100,115);doc.text("Documento Word cargado. El formato legado .doc se representa en el expediente por su ficha y nombre de archivo.",12,66,{maxWidth:186});return}doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(23,32,51);const lines=doc.splitTextToSize(body,184);let y=65;for(let i=0;i<lines.length;i++){if(y>282){doc.addPage();pdfHeader(doc,title);doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(23,32,51);y=34}doc.text(lines[i],13,y);y+=3.6}}
async function pdfAddUploadedDocument(doc,file,title,label){if(!file)return;if(isImage(file)){const data=await fileDataUrl(file);pdfAddRenderedPage(doc,data,title,label);return}if(isPdf(file)){try{const pages=await renderSourcePdf(file);if(pages.length){for(let i=0;i<pages.length;i++)pdfAddRenderedPage(doc,pages[i],title,label+" · página "+(i+1));return}}catch(e){}doc.addPage();pdfHeader(doc,title);doc.setFontSize(10);doc.text(label+": "+file.name,12,38);return}if(isWord(file)){await pdfAddWordDocument(doc,file,title,label);return}doc.addPage();pdfHeader(doc,title);doc.setFontSize(10);doc.text(label+": "+file.name,12,38);doc.setFontSize(8);doc.setTextColor(100,110,120);doc.text("Documento adjunto. Este formato se identifica por nombre dentro del expediente.",12,46);}
function pdfFooters(doc){const total=doc.getNumberOfPages();for(let i=1;i<=total;i++){doc.setPage(i);pdfFooterOne(doc,i,total)}}
function stage1PdfStatus(){return stage1Decision?.status?String(stage1Decision.status).toUpperCase():"PENDING";}
async function persistPdf(kind,doc){if(!currentCaseId)return;try{const blob=doc.output("blob");await fetch("/api/cases/"+encodeURIComponent(currentCaseId)+"/pdf/"+kind,{method:"PUT",headers:{"content-type":"application/pdf"},body:blob})}catch{}}
async function downloadStage1Pdf(onlyPersist=false){requirePdfLibraries();const p=sentPayload||buildStage1Payload(),b=p.datos_basicos||{},c=p.informacion_complementaria||{},s=p.solicitud||{},doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"}),title="Expediente de precalificación de crédito - Paso 1";let y=pdfHeader(doc,title);y=pdfCompactSection(doc,"PASO 1 - DATOS BÁSICOS",[["Nombres y apellidos",b.nombre_completo],["DPI",b.numero_dpi],["NIT",b.nit],["Fecha de nacimiento",b.fecha_nacimiento],["Celular",b.numero_celular],["Estado civil",b.estado_civil],["Cónyuge",b.nombre_conyuge],["Género",b.genero]],y);y=pdfCompactSection(doc,"SOLICITUD",[["Producto de interés",b.producto_interes],["Producto solicitado",s.producto_solicitado],["Monto total solicitado",pdfMoney(s.monto_total_solicitado)],["Ingreso promedio mensual",pdfMoney(c.ingreso_promedio_mensual)]],y);y=pdfCompactSection(doc,"INFORMACIÓN COMPLEMENTARIA",[["Fuente de ingresos",c.fuente_ingresos],["Origen de ingresos",c.origen_ingresos],["Subtipo de ingreso",c.subtipo_ingreso],["Nacionalidad",c.tipo_nacionalidad],["Tipo de vivienda",c.tipo_vivienda],["Departamento",c.departamento],["Municipio",c.municipio],["Nivel de educación",c.nivel_educacion]],y);y=pdfCompactSection(doc,"RESULTADO / CONTROL",[["Estado",stage1PdfStatus()],["Solicitud",requestId||"No asignada"]],y);await pdfAddDpiPage(doc,title);pdfFooters(doc);await persistPdf("stage1",doc);if(!onlyPersist)doc.save(pdfClientName(b.nombre_completo)+".pdf");}
function validateStage2ForPdf(){if(!sentPayload)return"Primero completa el Paso 1.";const s2=buildStage2Payload(),g=stage2Group(),d=s2.domicilio||{},dig=s2.digitacion||{};if(!d.direccion_completa)return"Hace falta la dirección completa.";if(g==="company"){for(const k of ["nombre_empresa","direccion_empresa","telefono_empresa","antiguedad"])if(!dig[k])return"Completa todos los datos de empresa/institución."}else{for(const k of ["giro_oficio","direccion_empresa","telefono_empresa","antiguedad"])if(!dig[k])return"Completa todos los datos de la actividad/oficio."}const refErr=validateRefs(s2);if(refErr)return refErr;if(!q("#stage2Verified").checked)return"Marca la confirmación de revisión antes de generar el PDF.";return null;}
async function downloadFinalPdf(onlyPersist=false){const err=validateStage2ForPdf();if(err){alert(err);return}requirePdfLibraries();const s1=sentPayload,s2=buildStage2Payload(),b=s1.datos_basicos||{},c=s1.informacion_complementaria||{},s=s1.solicitud||{},d=s2.domicilio||{},dig=s2.digitacion||{},doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"}),title="Expediente completo de crédito";let y=pdfHeader(doc,title);y=pdfCompactSection(doc,"PASO 1 - PRECALIFICACIÓN",[["Nombres y apellidos",b.nombre_completo],["DPI",b.numero_dpi],["NIT",b.nit],["Fecha nacimiento",b.fecha_nacimiento],["Celular",b.numero_celular],["Estado civil",b.estado_civil],["Cónyuge",b.nombre_conyuge],["Género",b.genero],["Producto solicitado",s.producto_solicitado],["Monto solicitado",pdfMoney(s.monto_total_solicitado)],["Ingreso promedio",pdfMoney(c.ingreso_promedio_mensual)],["Vivienda",c.tipo_vivienda],["Ingresos",pdfValue(c.fuente_ingresos)+" / "+pdfValue(c.origen_ingresos)+" / "+pdfValue(c.subtipo_ingreso)],["Departamento",c.departamento],["Municipio",c.municipio],["Educación",c.nivel_educacion]],y);y=pdfCompactSection(doc,"PASO 2 - DOMICILIO",[["Dirección completa",d.direccion_completa]],y);const workFields=stage2Group()==="company"?[["Empresa / institución",dig.nombre_empresa],["Dirección",dig.direccion_empresa],["Teléfono",dig.telefono_empresa],["Antigüedad",dig.antiguedad]]:[["Giro / actividad / oficio",dig.giro_oficio],["Dirección de actividad",dig.direccion_empresa],["Teléfono de actividad",dig.telefono_empresa],["Antigüedad",dig.antiguedad]];y=pdfCompactSection(doc,"PASO 2 - ACTIVIDAD / INGRESOS",workFields,y);const refs=s2.referencias||[];for(let i=0;i<3;i++){const r=refs[i]||{};y=pdfCompactSection(doc,"REFERENCIA "+(i+1),[["Nombre completo",r.nombre_completo],["Parentesco",r.parentesco],["Celular",r.celular],["Mayor de edad","SI"],["Vive con el cliente","NO"],["Confirma domicilio/datos laborales","SI"],["Localizable","SI"]],y)}await pdfAddDpiPage(doc,title);await pdfAddUploadedDocument(doc,preparedUploads.stage2Selfie[0],title,"Selfie del cliente sosteniendo DPI");for(let i=0;i<preparedUploads.stage2Utility.length;i++)await pdfAddUploadedDocument(doc,preparedUploads.stage2Utility[i],title,"Documento de domicilio "+(i+1));for(let i=0;i<preparedUploads.stage2Income.length;i++)await pdfAddUploadedDocument(doc,preparedUploads.stage2Income[i],title,"Sustento de ingresos "+(i+1));pdfFooters(doc);await persistPdf("final",doc);finalPayloadCache={workflow:{initial_validation:{result:"approved_by_admin",request_id:requestId},reviewed_by_user:true,submitted_at:new Date().toISOString()},stage1:s1,stage2:s2};if(!onlyPersist)doc.save(pdfClientName(b.nombre_completo)+".pdf");}
q("#analyzeBtn").addEventListener("click",async()=>{const b=q("#analyzeBtn");b.disabled=true;b.innerHTML='<span class="spinner"></span> Leyendo los datos del DPI...';q("#extractMsg").innerHTML="";try{const fd=new FormData();fd.append("dpi_front",preparedUploads.dpiFront[0],preparedUploads.dpiFront[0].name);fd.append("dpi_back",preparedUploads.dpiBack[0],preparedUploads.dpiBack[0].name);const r=await fetch("/api/stage1/extract",{method:"POST",body:fd}),raw=await r.text();let data;try{data=JSON.parse(raw)}catch{throw new Error("El servidor devolvió una respuesta no válida: "+raw.slice(0,250))}if(!r.ok||!data.ok)throw new Error(data.error||"No se pudieron leer los datos del DPI.");extracted=data.extraction;q("#formCard").classList.remove("hidden");applyExtraction(extracted.fields,q("#preForm"));q('[name="datos_basicos.producto_interes"]').value="CCO ELECTRO";q('[name="datos_basicos.dpi_foto"]').value=preparedUploads.dpiFront[0]?.name||"";q('[name="informacion_complementaria.tipo_nacionalidad"]').value="GUATEMALA";const dq=extracted.dpi_quality,problems=!dq?.anverso_legible||!dq?.reverso_legible||dq?.vigencia==="vencido";q("#qualityBadge").className="badge "+(problems?"warn":"ok");q("#qualityBadge").textContent=problems?"Revisar DPI":"DPI verificado";q("#qualityBox").innerHTML='<div class="notice '+(problems?'warning':'success')+'"><strong>Revisión del DPI</strong><br>Anverso legible: '+(dq?.anverso_legible?'Sí':'No')+' · Reverso legible: '+(dq?.reverso_legible?'Sí':'No')+' · Vigencia: '+esc(dq?.vigencia||'no_determinado')+'</div>';q("#extractMsg").innerHTML='<div class="notice success"><strong>¡Listo!</strong> Revisa los datos y completa lo que falte.</div>';updateStage1ValidationUI();setProgress(2);q("#formCard").scrollIntoView({behavior:"smooth"})}catch(e){q("#extractMsg").innerHTML='<div class="notice bad">'+esc(e.message)+'</div>'}finally{b.textContent="Leer datos del DPI";updateButtons()}});
q("#showJsonBtn").addEventListener("click",()=>{q("#jsonPreview").textContent=JSON.stringify(buildStage1Payload(),null,2);q("#jsonPreview").classList.toggle("hidden")});
q("#preForm").addEventListener("submit",async e=>{e.preventDefault();const p=buildStage1Payload(),b=p.datos_basicos||{},c=p.informacion_complementaria||{},s=p.solicitud||{};for(const [k,l] of [["nombre_completo","Nombre completo"],["numero_dpi","Número de DPI"],["fecha_nacimiento","Fecha de nacimiento"],["nit","NIT"],["numero_celular","Celular"],["estado_civil","Estado civil"],["genero","Género"]])if(!b[k]){q("#submitMsg").innerHTML='<div class="notice bad">Hace falta: '+esc(l)+'.</div>';return}if(!validPhone(b.numero_celular)){q("#submitMsg").innerHTML='<div class="notice bad">El celular del cliente debe tener exactamente 8 dígitos.</div>';return}if(b.estado_civil==="CASADO"&&!b.nombre_conyuge){q("#submitMsg").innerHTML='<div class="notice bad">Ingresa el nombre del cónyuge.</div>';return}if(!s.producto_solicitado||!s.producto_sku){q("#submitMsg").innerHTML='<div class="notice bad">Selecciona el producto desde el catálogo ZasHome.</div>';return}if(!(Number(s.monto_total_solicitado)>0)){q("#submitMsg").innerHTML='<div class="notice bad">Ingresa un monto solicitado válido.</div>';return}if(!(Number(c.ingreso_promedio_mensual)>0)){q("#submitMsg").innerHTML='<div class="notice bad">Ingresa el ingreso promedio mensual del cliente.</div>';return}for(const [k,l] of [["fuente_ingresos","Fuente de ingresos"],["origen_ingresos","Origen de ingresos"],["subtipo_ingreso","Subtipo de ingreso"],["tipo_vivienda","Tipo de vivienda"],["departamento","Departamento"],["municipio","Municipio"],["nivel_educacion","Nivel de educación"]])if(!c[k]){q("#submitMsg").innerHTML='<div class="notice bad">Hace falta: '+esc(l)+'.</div>';return}if(!q("#verified").checked){q("#submitMsg").innerHTML='<div class="notice warning">Marca la casilla de confirmación.</div>';return}sentPayload=p;const btn=q("#submitBtn");btn.disabled=true;btn.textContent="Enviando...";try{const fd=new FormData();fd.append("payload_json",JSON.stringify(p));if(preparedUploads.dpiFront[0])fd.append("dpi_front",preparedUploads.dpiFront[0],preparedUploads.dpiFront[0].name);if(preparedUploads.dpiBack[0])fd.append("dpi_back",preparedUploads.dpiBack[0],preparedUploads.dpiBack[0].name);const r=await fetch("/api/stage1/submit",{method:"POST",body:fd}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||"No se pudo enviar el Paso 1.");requestId=data.result.request_id;currentCaseId=data.result.case_id||currentCaseId;stage1Decision={status:data.result.status||"pending",message:data.result.message||""};downloadStage1Pdf(true).catch(()=>{});q("#stage1PdfBtn").disabled=false;q("#stage1PdfBtn2").disabled=false;q("#stage1PdfBtnForm").disabled=false;q("#stage1PdfHint").textContent="PDF del Paso 1 listo para descargar.";clearDraft(false);q("#decisionCard").classList.remove("hidden");q("#decisionBadge").textContent=sellerStateLabel(data.result.estado||"SUBIDA");q("#decisionBody").innerHTML='<div class="notice success"><strong>Paso 1 enviado al administrador.</strong><br>Solicitud: '+esc(requestId||'N/D')+'<br>Estado: '+esc(sellerStateLabel(data.result.estado||"SUBIDA"))+'</div>';setProgress(3);q("#decisionCard").scrollIntoView({behavior:"smooth"})}catch(err){q("#submitMsg").innerHTML='<div class="notice bad">'+esc(err.message)+'</div>'}finally{btn.disabled=false;btn.textContent="Enviar solicitud del paso 1"}});
q("#stage1PdfBtn").addEventListener("click",()=>downloadStage1Pdf().catch(e=>alert(e.message)));q("#stage1PdfBtn2").addEventListener("click",()=>downloadStage1Pdf().catch(e=>alert(e.message)));q("#stage1PdfBtnForm").addEventListener("click",()=>downloadStage1Pdf().catch(e=>alert(e.message)));q("#finalPdfBtn").addEventListener("click",()=>downloadFinalPdf().catch(e=>alert(e.message)));q("#finalPdfBtnTop").addEventListener("click",()=>downloadFinalPdf().catch(e=>alert(e.message)));
q("#stage2AnalyzeBtn").addEventListener("click",async()=>{const btn=q("#stage2AnalyzeBtn");btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Leyendo documentos...';q("#stage2ExtractMsg").innerHTML="";try{const fd=new FormData();fd.append("selfie",preparedUploads.stage2Selfie[0],preparedUploads.stage2Selfie[0].name);preparedUploads.stage2Utility.forEach(f=>fd.append("utility_files",f,f.name));preparedUploads.stage2Income.forEach(f=>fd.append("income_files",f,f.name));fd.append("stage1_json",JSON.stringify(sentPayload));fd.append("case_id",currentCaseId||"");const r=await fetch("/api/stage2/extract",{method:"POST",body:fd}),raw=await r.text();let data;try{data=JSON.parse(raw)}catch{throw new Error("Respuesta no válida: "+raw.slice(0,250))}if(!r.ok||!data.ok)throw new Error(data.error||"No se pudieron analizar los documentos.");stage2Extraction=data.extraction;if(currentRecordState&&data.documents)currentRecordState.stage2_documents=data.documents;q("#stage2FormCard").classList.remove("hidden");applyExtraction(stage2Extraction.fields,q("#stage2Form"));const g=stage2Group();if(g==="activity"){const d=q('[name="digitacion.direccion_empresa"]'),t=q('[name="digitacion.telefono_empresa"]');if(!d.value)d.value=q('[name="domicilio.direccion_completa"]')?.value||"";if(!t.value)t.value=sentPayload?.datos_basicos?.numero_celular||""}const sc=stage2Extraction.selfie_check,dc=stage2Extraction.domicile_consistency,ic=stage2Extraction.income_consistency;const problem=!sc?.persona_visible||!sc?.dpi_visible_junto_al_rostro||sc?.texto_dpi_comparable==="no_coincide"||dc?.status==="possible_conflict"||ic?.status==="possible_conflict";q("#stage2QualityBadge").className="badge "+(problem?"warn":"ok");q("#stage2QualityBadge").textContent=problem?"Revisar":"Documentos revisados";q("#stage2QualityBox").innerHTML='<div class="notice '+(problem?'warning':'success')+'"><strong>Revisión automática</strong><br>Selfie con DPI: '+(sc?.dpi_visible_junto_al_rostro?'Correcta':'Revisar')+' · Domicilio: '+esc(dc?.status||'insufficient')+' · Ingresos: '+esc(ic?.status||'not_applicable')+'</div>';stage2AnalyzedSignature=stage2Signature();q("#stage2ExtractMsg").innerHTML='<div class="notice success"><strong>Documentos leídos.</strong> Revisa y completa únicamente lo que falte. Si cambias un archivo, podrás analizarlos de nuevo.</div>';updateStage2ValidationUI();q("#stage2FormCard").scrollIntoView({behavior:"smooth"})}catch(e){q("#stage2ExtractMsg").innerHTML='<div class="notice bad">'+esc(e.message)+'</div>'}finally{btn.textContent="Leer documentos y completar datos";updateButtons()}});
q("#stage2JsonBtn").addEventListener("click",()=>{const final={stage1:sentPayload,stage2:buildStage2Payload()};q("#stage2JsonPreview").textContent=JSON.stringify(final,null,2);q("#stage2JsonPreview").classList.toggle("hidden")});
q("#stage2Form").addEventListener("submit",async e=>{e.preventDefault();const s2=buildStage2Payload(),g=stage2Group(),d=s2.domicilio||{},dig=s2.digitacion||{};if(!d.direccion_completa){q("#finalMsg").innerHTML='<div class="notice bad">Hace falta la dirección completa.</div>';return}if(g==="company"){for(const [k,l] of [["nombre_empresa","nombre de empresa/institución"],["direccion_empresa","dirección"],["telefono_empresa","teléfono"],["antiguedad","antigüedad"]])if(!dig[k]){q("#finalMsg").innerHTML='<div class="notice bad">Hace falta '+l+'.</div>';return}}else{for(const [k,l] of [["giro_oficio","giro/actividad/oficio"],["direccion_empresa","dirección de actividad"],["telefono_empresa","teléfono"],["antiguedad","antigüedad"]])if(!dig[k]){q("#finalMsg").innerHTML='<div class="notice bad">Hace falta '+l+'.</div>';return}}if(s2.digitacion?.telefono_empresa&&!validPhone(s2.digitacion.telefono_empresa)){q("#finalMsg").innerHTML='<div class="notice bad">El teléfono de empresa/actividad debe tener exactamente 8 dígitos.</div>';return}const refErr=validateRefs(s2);if(refErr){q("#finalMsg").innerHTML='<div class="notice bad">'+esc(refErr)+'</div>';return}if(!q("#stage2Verified").checked){q("#finalMsg").innerHTML='<div class="notice warning">Marca la confirmación antes de enviar.</div>';return}const finalPayload={workflow:{initial_validation:{result:"approved_by_admin",request_id:requestId},reviewed_by_user:true,submitted_at:new Date().toISOString()},stage1:sentPayload,stage2:s2};finalPayloadCache=finalPayload;const btn=q("#finalSubmitBtn");btn.disabled=true;btn.textContent="Enviando expediente...";try{const r=await fetch("/api/final/submit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(finalPayload)}),data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||"No se pudo enviar el expediente.");q("#finalResultCard").classList.remove("hidden");q("#finalResultCard").open=false;q("#finalResultBody").innerHTML='<div class="notice success"><strong>Expediente completo enviado.</strong><br>El expediente fue enviado al administrador para revisión.</div><pre>'+esc(JSON.stringify(data.result,null,2))+'</pre>';q("#finalPdfBtn").disabled=false;q("#finalPdfBtnTop").disabled=false;q("#finalPdfHint").textContent="Expediente completo listo para descargar.";clearDraft();downloadFinalPdf(true).catch(()=>{})}catch(err){q("#finalMsg").innerHTML='<div class="notice bad">'+esc(err.message)+'</div>'}finally{btn.disabled=false;btn.textContent="Enviar expediente completo"}});
q("#cancelEditStage1")?.addEventListener("click",()=>{if(confirm("¿Cancelar la edición y volver sin guardar los cambios?"))goHome()});q("#cancelEditStage2")?.addEventListener("click",()=>{if(confirm("¿Cancelar la edición y volver sin guardar los cambios?"))goHome()});
q("#resetBtn").addEventListener("click",()=>location.reload());updateButtons();updateStage1ValidationUI();

setupPhoneInputs();
if(adminMode){checkAdminWorkspace()}else{loadSellerOptions();if(localStorage.getItem(DRAFT_KEY))q("#draftBanner")?.classList.remove("hidden");checkSellerSession()}
</script>
</body>
</html>`;


const ADMIN_HTML = String.raw`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CrediZas Admin</title><style>
:root{--blue:#14577a;--yellow:#f3c51d;--line:#dce3ee;--muted:#667085;--bad:#c62828}*{box-sizing:border-box}body{font-family:Inter,system-ui,Arial;margin:0;background:#f5f7fb;color:#172033}.wrap{max-width:1560px;margin:18px auto;padding:0 14px}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:15px;margin-bottom:12px}h1{font-size:22px;margin:0 0 14px}input,select,button{font:inherit;padding:8px;border:1px solid #cbd5e1;border-radius:8px;min-width:0}button{background:var(--blue);color:#fff;border:0;font-weight:800;cursor:pointer}.secondary{background:#e9eef5;color:#334155}.yellow{background:var(--yellow);color:#292300}.danger{background:#c62828}.grid{display:grid;grid-template-columns:minmax(180px,2fr) repeat(4,minmax(125px,1fr));gap:7px}.newbar{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:8px;align-items:end}.hidden{display:none!important}.table{overflow:auto;padding:0}table{width:100%;border-collapse:collapse;font-size:11px;table-layout:auto}th,td{padding:6px 7px;border-bottom:1px solid #e7ecf2;text-align:left;vertical-align:top}th{background:#f8fafc;position:sticky;top:0;z-index:2;white-space:nowrap}td{max-width:220px;overflow-wrap:anywhere}.compact{white-space:nowrap;width:1%}.client{min-width:145px}.control-cell{min-width:230px;max-width:290px}.control-cell select{padding:5px;font-size:10px;max-width:138px}.actions{display:flex;gap:5px;flex-wrap:wrap}.actions button{padding:6px 8px;font-size:10px}.fields{display:flex;gap:10px;flex-wrap:wrap}.fields label{font-size:11px}.pdfs{white-space:nowrap}.pdfs a{margin-right:6px}.msg{font-size:10px;margin-top:4px;color:#475467}.procede{color:#166534;font-weight:700}.closed{color:#991b1b;font-weight:800}@media(max-width:980px){.grid{grid-template-columns:1fr 1fr}.newbar{grid-template-columns:1fr}.table{overflow:auto}table{min-width:900px}}</style></head><body><div class="wrap"><h1>CrediZas · Administración</h1>
<div class="card" id="loginCard"><h3>Ingreso de administrador</h3><div class="actions"><input id="adminUser" placeholder="Usuario"><input id="adminPass" type="password" placeholder="Contraseña"><button id="loginBtn">Ingresar</button><button id="exitLoginBtn" class="secondary">Salir a usuarios</button></div><div id="loginMsg" class="msg"></div></div>
<div id="adminApp" class="hidden">
<div class="card"><div class="newbar"><div><strong>Nueva solicitud desde administración</strong><div class="msg">Selecciona el vendedor al que quedará vinculada.</div><select id="newSeller"><option value="">Seleccionar vendedor</option></select></div><button id="newCaseAdminBtn" class="yellow">Nueva solicitud</button></div></div>
<div class="card"><div class="grid"><input id="fQ" placeholder="Nombre, DPI, NIT o teléfono"><select id="fStatus"><option value="">Todos los estados</option><option>SUBIDA</option><option value="EN REVISION">EN REVISIÓN</option><option value="REQUIERE DATOS">REQUIERE INFORMACIÓN</option><option>REINGRESADO</option><option>APROBADA</option><option>RECHAZADA</option></select><select id="fProcess"><option value="">Todos los procesos</option><option value="PRECALIFICACION">PRECALIFICACIÓN</option><option value="FORMALIZACION DE CREDITO">FORMALIZACIÓN DE CRÉDITO</option></select><select id="fSeller"><option value="">Todos los vendedores</option></select><select id="fSort"><option value="updated_desc">Más recientes</option><option value="date_asc">Más antiguos</option><option value="name_asc">Nombre A-Z</option><option value="nit_asc">NIT</option></select></div><div class="actions" style="margin-top:9px"><button id="searchBtn">Buscar</button><button id="exportBtn" class="yellow">Descargar Excel</button><button id="logoutBtn" class="secondary">Cerrar sesión</button></div><div id="adminActionMsg" class="msg"></div></div>
<div class="card"><details><summary style="cursor:pointer;font-weight:800">Seleccionar columnas visibles</summary><div id="fieldChooser" class="fields" style="margin-top:10px"></div></details></div>
<div class="card table"><table><thead><tr id="headRow"></tr></thead><tbody id="rows"></tbody></table></div></div></div>
<script>
const q=s=>document.querySelector(s);const defs={updated_at:"Fecha",nombre:"Cliente",dpi:"DPI",nit:"NIT",telefono:"Teléfono",vendedor:"Vendedor",producto:"Producto",monto:"Monto",ingreso:"Ingreso",proceso:"Proceso",estado:"Estado",detalle:"Detalle",procede:"Qué procede"};let dataRows=[];let visible=["updated_at","nombre","dpi","telefono","vendedor","proceso","estado"];const deletedIds=new Set();
function esc(v){return String(v??"").replace(/[&<>\"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#039;"}[s]))}function money(v){return "Q "+Number(v||0).toLocaleString("es-GT",{minimumFractionDigits:2,maximumFractionDigits:2})}function labelState(v){return v==="REQUIERE DATOS"?"REQUIERE INFORMACIÓN":v==="EN REVISION"?"EN REVISIÓN":v}function labelProcess(v){return v==="FORMALIZACION DE CREDITO"?"Formalización":"Precalificación"}
function initFields(){const box=q("#fieldChooser");box.innerHTML=Object.entries(defs).map(([k,l])=>'<label><input type="checkbox" data-field="'+k+'" '+(visible.includes(k)?'checked':'')+'> '+l+'</label>').join("");box.querySelectorAll("input").forEach(x=>x.onchange=()=>{visible=[...box.querySelectorAll("input:checked")].map(i=>i.dataset.field);render()})}
function display(c,k){if(k==="updated_at")return c[k]?new Date(c[k]).toLocaleString("es-GT"):"";if(k==="monto"||k==="ingreso")return money(c[k]);if(k==="proceso")return labelProcess(c[k]);if(k==="estado")return labelState(c[k]);return c[k]??""}
function tdClass(k){return ["updated_at","dpi","nit","telefono","proceso","estado"].includes(k)?"compact":k==="nombre"?"client":""}
function render(){q("#headRow").innerHTML=visible.map(k=>'<th>'+esc(defs[k])+'</th>').join("")+'<th>Control</th><th>PDF</th><th>Acciones</th>';q("#rows").innerHTML=dataRows.map(c=>'<tr>'+visible.map(k=>'<td class="'+tdClass(k)+'">'+esc(display(c,k))+'</td>').join("")+'<td class="control-cell"><div class="actions"><select data-proc="'+esc(c.id)+'"><option value="PRECALIFICACION" '+(c.proceso==="PRECALIFICACION"?'selected':'')+'>Precalificación</option><option value="FORMALIZACION DE CREDITO" '+(c.proceso==="FORMALIZACION DE CREDITO"?'selected':'')+'>Formalización</option></select><select data-state="'+esc(c.id)+'"><option '+(c.estado==="SUBIDA"?'selected':'')+'>SUBIDA</option><option value="EN REVISION" '+(c.estado==="EN REVISION"?'selected':'')+'>EN REVISIÓN</option><option value="REQUIERE DATOS" '+(c.estado==="REQUIERE DATOS"?'selected':'')+'>REQUIERE INFORMACIÓN</option><option '+(c.estado==="REINGRESADO"?'selected':'')+'>REINGRESADO</option><option '+(c.estado==="APROBADA"?'selected':'')+'>APROBADA</option><option '+(c.estado==="RECHAZADA"?'selected':'')+'>RECHAZADA</option></select><button data-save="'+esc(c.id)+'">Guardar</button></div><div class="msg">'+(c.detalle?'<strong>Detalle:</strong> '+esc(c.detalle):'')+(c.procede?'<div class="procede"><strong>Procede:</strong> '+esc(c.procede)+'</div>':'')+(c.cerrado?'<div class="closed">Expediente cerrado</div>':'')+'</div></td><td class="pdfs">'+(c.pdf_stage1?'<a href="/api/admin/pdf/'+encodeURIComponent(c.id)+'/stage1" target="_blank">P1</a>':'')+(c.pdf_final?'<a href="/api/admin/pdf/'+encodeURIComponent(c.id)+'/final" target="_blank">P2</a>':'')+'</td><td><div class="actions"><button data-edit="'+esc(c.id)+'" class="secondary">Editar</button><button data-delete="'+esc(c.id)+'" class="danger">Eliminar</button></div></td></tr>').join("");q("#rows").querySelectorAll("[data-save]").forEach(b=>b.onclick=()=>saveControl(b.dataset.save,b));q("#rows").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>location.href="/?admin=1&case_id="+encodeURIComponent(b.dataset.edit));q("#rows").querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteCase(b.dataset.delete))}
async function loadSellers(){const r=await fetch("/api/admin/sellers"),d=await r.json();if(!r.ok)return;for(const sel of [q("#fSeller"),q("#newSeller")]){const first=sel.options[0]?.outerHTML||'<option value="">Seleccionar vendedor</option>';sel.innerHTML=first;for(const v of d.sellers||[]){const o=document.createElement("option");o.value=v.id;o.textContent=v.name;sel.appendChild(o)}}}
function queryUrl(path){const u=new URL(path,location.origin);[["q","#fQ"],["status","#fStatus"],["process","#fProcess"],["seller_id","#fSeller"],["sort","#fSort"]].forEach(([k,s])=>{const v=q(s).value;if(v)u.searchParams.set(k,v)});return u}
async function search(){const r=await fetch(queryUrl("/api/admin/cases"),{cache:"no-store"}),d=await r.json();if(r.status===401){q("#loginCard").classList.remove("hidden");q("#adminApp").classList.add("hidden");return}q("#loginCard").classList.add("hidden");q("#adminApp").classList.remove("hidden");dataRows=(d.cases||[]).filter(x=>!deletedIds.has(String(x.id)));render()}
async function saveControl(id,btn){const c=dataRows.find(x=>x.id===id)||{},row=btn?.closest("tr"),stateEl=row?.querySelector("[data-state]"),processEl=row?.querySelector("[data-proc]");if(!stateEl||!processEl){alert("No se encontró el control de estado/proceso de este expediente. Recarga la página e intenta nuevamente.");return}let state=stateEl.value,process=processEl.value,detail="",procede="";if(state==="REQUIERE DATOS")detail=prompt("¿Qué información debe corregir o completar el vendedor?",c.detalle||"")||"";if(state==="RECHAZADA")detail=prompt("¿Por qué no aplica al crédito?",c.detalle||"")||"";if((state==="REQUIERE DATOS"||state==="RECHAZADA")&&!detail.trim())return;if(process==="PRECALIFICACION"&&state==="APROBADA"&&!c.tiene_paso2){process="FORMALIZACION DE CREDITO";processEl.value=process}if(process==="FORMALIZACION DE CREDITO"&&state==="APROBADA"&&c.tiene_paso2){procede=prompt("¿Qué procede con el cliente?",c.procede||"")||"";if(!procede.trim())return}const original=btn.textContent;btn.disabled=true;btn.textContent="Guardando…";try{const r=await fetch("/api/admin/cases/"+encodeURIComponent(id)+"/control",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({estado:state,proceso:process,detalle:detail,procede})}),raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{throw new Error("El servidor devolvió una respuesta no válida: "+raw.slice(0,180))}if(!r.ok)throw new Error(d.error||"No se pudo actualizar");const i=dataRows.findIndex(x=>x.id===id);if(i>=0&&d.case)dataRows[i]={...dataRows[i],...d.case};render();const msg=q("#adminActionMsg");if(msg){msg.className="msg notice success";msg.innerHTML=state==="APROBADA"&&!c.tiene_paso2?"<strong>Guardado.</strong> Paso 1 aprobado y Paso 2 habilitado para el vendedor.":"<strong>Guardado correctamente.</strong>"}setTimeout(()=>search().catch(()=>{}),1500)}catch(e){alert(e.message||"No se pudo actualizar");btn.disabled=false;btn.textContent=original}}
async function deleteCase(id){const c=dataRows.find(x=>x.id===id);if(!confirm("¿Eliminar definitivamente el expediente de "+(c?.nombre||"este cliente")+"? También se eliminarán sus PDFs y documentos guardados."))return;const r=await fetch("/api/admin/cases/"+encodeURIComponent(id),{method:"DELETE",cache:"no-store"}),raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}if(!r.ok){alert(d.error||"No se pudo eliminar");return}deletedIds.add(String(id));dataRows=dataRows.filter(x=>String(x.id)!==String(id));render();const msg=q("#adminActionMsg");if(msg){msg.className="msg notice success";msg.innerHTML="<strong>Expediente eliminado.</strong> El registro, PDFs y documentos asociados fueron enviados a eliminación."}}
q("#loginBtn").onclick=async()=>{const r=await fetch("/api/admin/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({user:q("#adminUser").value,password:q("#adminPass").value})}),d=await r.json();q("#loginMsg").textContent=d.ok?"Ingreso correcto":(d.error||"No autorizado");if(d.ok){await loadSellers();search()}};q("#exitLoginBtn").onclick=()=>location.href="/";q("#newCaseAdminBtn").onclick=()=>{const sid=q("#newSeller").value;if(!sid){alert("Selecciona un vendedor.");return}location.href="/?admin=1&seller_id="+encodeURIComponent(sid)};q("#searchBtn").onclick=search;q("#exportBtn").onclick=()=>{const u=queryUrl("/api/admin/export.xls");u.searchParams.set("fields",visible.join(","));location.href=u};q("#logoutBtn").onclick=async()=>{await fetch("/api/admin/logout",{method:"POST"});location.reload()};["#fQ","#fStatus","#fProcess","#fSeller","#fSort"].forEach(s=>q(s).addEventListener("change",search));initFields();search().then(()=>loadSellers());
</script></body></html>`;

// -----------------------------
// WORKER ROUTER
// -----------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/admin") return html(ADMIN_HTML);

    if (request.method === "GET" && url.pathname === "/api/catalog") {
      try {
        const seller = await verifySeller(request, env);
        if (!seller && !(await verifyAdmin(request, env))) return json({ ok:false, error:"Inicia sesión." }, 401);
        const data = await fetchCatalogFromZasHome(env, {
          q: url.searchParams.get("q") || "",
          category: url.searchParams.get("category") || "",
          type: url.searchParams.get("type") || ""
        });
        return json({ ok:true, data:data.slice(0, 50).map(p=>({producto_id:p.producto_id,sku:p.sku,nombre:p.nombre,descripcion:p.descripcion,categoria:p.categoria,tipo_producto:p.tipo_producto,imagen_principal_url:p.imagen_principal_url,monto_solicitado:requestedAmountFromCatalogPrice(p.precio)})) });
      } catch (e) { return json({ ok:false, error:e?.message || "Error consultando catálogo." }, 502); }
    }

    if (request.method === "GET" && url.pathname === "/api/sellers/public") {
      return json({ ok:true, sellers:await listSellers(env) });
    }

    if (request.method === "POST" && url.pathname === "/api/seller/register") {
      try {
        if (!env.CREDIZAS_KV) return json({ok:false,error:"CREDIZAS_KV no está configurado."},503);
        const body = await request.json();
        const name = normalizeSellerName(body?.name);
        const pin = String(body?.pin || "");
        if (name.length < 3 || name.length > 100) return json({ok:false,error:"Escribe el nombre completo del vendedor."},400);
        if (!/^\d{4}$/.test(pin)) return json({ok:false,error:"El PIN debe tener exactamente 4 números."},400);
        const sellers = await listSellers(env);
        if (sellers.some(x => normalizeSellerName(x.name).toLowerCase() === name.toLowerCase())) return json({ok:false,error:"Ese vendedor ya existe. Selecciónalo para ingresar."},409);
        const seller = { id:crypto.randomUUID(), name, active:true, created_at:new Date().toISOString() };
        seller.pin_hash = await sellerPinHash(env, seller.id, pin);
        await kvPutJson(env, SELLER_PREFIX + seller.id, seller);
        const token = await createSellerToken(env, seller);
        const res = json({ok:true,seller:{id:seller.id,name:seller.name}});
        res.headers.append("set-cookie", `${SELLER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
        return res;
      } catch(e) { return json({ok:false,error:e?.message||"No se pudo crear el vendedor."},400); }
    }

    if (request.method === "POST" && url.pathname === "/api/seller/login") {
      try {
        const body = await request.json();
        const sellerId = String(body?.seller_id || "");
        const pin = String(body?.pin || "");
        if (!sellerId || !/^\d{4}$/.test(pin)) return json({ok:false,error:"Vendedor o PIN inválido."},400);
        const seller = await kvGetJson(env, SELLER_PREFIX + sellerId);
        if (!seller || seller.active === false) return json({ok:false,error:"Vendedor no encontrado."},404);
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const failKey = SELLER_FAIL_PREFIX + sellerId + ":" + ip;
        const fails = Number(await env.CREDIZAS_KV?.get(failKey) || 0);
        if (fails >= 5) return json({ok:false,error:"Demasiados intentos. Intenta nuevamente en unos minutos."},429);
        const expected = await sellerPinHash(env, seller.id, pin);
        if (expected !== seller.pin_hash) {
          if (env.CREDIZAS_KV) await env.CREDIZAS_KV.put(failKey, String(fails+1), {expirationTtl:600});
          return json({ok:false,error:"PIN incorrecto."},401);
        }
        if (env.CREDIZAS_KV) await env.CREDIZAS_KV.delete(failKey);
        const token = await createSellerToken(env, seller);
        const res = json({ok:true,seller:{id:seller.id,name:seller.name}});
        res.headers.append("set-cookie", `${SELLER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
        return res;
      } catch(e) { return json({ok:false,error:e?.message||"Error de ingreso."},400); }
    }

    if (request.method === "GET" && url.pathname === "/api/seller/me") {
      const seller = await verifySeller(request, env);
      return seller ? json({ok:true,seller}) : json({ok:false,error:"Sin sesión."},401);
    }

    if (request.method === "POST" && url.pathname === "/api/seller/logout") {
      const res=json({ok:true});res.headers.append("set-cookie",`${SELLER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);return res;
    }

    if (request.method === "GET" && url.pathname === "/api/seller/cases") {
      const seller = await verifySeller(request, env); if(!seller)return json({ok:false,error:"No autorizado."},401);
      const records = await listCaseRecords(env,{q:url.searchParams.get("q")||"",sort:"updated_desc"});
      return json({ok:true,cases:records.filter(r=>sellerOwnsCase(r,seller)).map(r=>caseSummary(r))});
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/seller/cases/")) {
      const seller=await verifySeller(request,env);if(!seller)return json({ok:false,error:"No autorizado."},401);
      const id=decodeURIComponent(url.pathname.split("/").filter(Boolean)[3]||"");const rec=await loadCaseRecord(env,id);
      if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);if(!sellerOwnsCase(rec,seller))return json({ok:false,error:"Este expediente pertenece a otro vendedor."},403);
      return json({ok:true,case:rec,permissions:sellerCasePermissions(rec)});
    }

    if (request.method === "GET" && /^\/api\/cases\/[^/]+\/documents\/[^/]+$/.test(url.pathname)) {
      const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"No autorizado."},401);
      const parts=url.pathname.split("/").filter(Boolean),id=decodeURIComponent(parts[2]||""),docId=decodeURIComponent(parts[4]||"");const rec=await loadCaseRecord(env,id);if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);if(!isAdmin&&!sellerOwnsCase(rec,seller))return json({ok:false,error:"Expediente no autorizado."},403);const meta=findCaseDocument(rec,docId);if(!meta)return json({ok:false,error:"Documento no encontrado."},404);if(!env.CREDIZAS_FILES)return json({ok:false,error:"R2 no configurado."},503);const quota=await reserveR2Usage(env,{class_b:1});if(!quota.ok)return r2QuotaBlockedResponse(quota);const obj=await env.CREDIZAS_FILES.get(meta.key);if(!obj)return json({ok:false,error:"Archivo no encontrado en R2."},404);const headers=new Headers();obj.writeHttpMetadata(headers);headers.set("content-type",meta.type||headers.get("content-type")||"application/octet-stream");headers.set("content-disposition",`inline; filename*=UTF-8''${encodeURIComponent(meta.name||"documento")}`);headers.set("cache-control","private, no-store");return new Response(obj.body,{headers});
    }

    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      try {
        const body = await request.json();
        if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return json({ ok:false, error:"Configura ADMIN_USER y ADMIN_PASSWORD." }, 503);
        if (body?.user !== env.ADMIN_USER || body?.password !== env.ADMIN_PASSWORD) return json({ ok:false, error:"Credenciales incorrectas." }, 401);
        const token = await createAdminToken(env, body.user);
        const res = json({ ok:true });
        res.headers.append("set-cookie", `credizas_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
        return res;
      } catch (e) { return json({ ok:false, error:e?.message || "Error de login." }, 400); }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/logout") {
      const res = json({ ok:true });
      res.headers.append("set-cookie", "credizas_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
      return res;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/me") {
      return (await verifyAdmin(request, env)) ? json({ok:true,admin:true}) : json({ok:false,error:"No autorizado."},401);
    }

    if (request.method === "GET" && /^\/api\/admin\/cases\/[^/]+$/.test(url.pathname)) {
      if (!(await verifyAdmin(request, env))) return json({ok:false,error:"No autorizado."},401);
      const id=decodeURIComponent(url.pathname.split("/").filter(Boolean)[3]||"");const rec=await loadCaseRecord(env,id);if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);
      return json({ok:true,case:rec,summary:caseSummary(rec)});
    }

    if (request.method === "DELETE" && /^\/api\/admin\/cases\/[^/]+$/.test(url.pathname)) {
      if (!(await verifyAdmin(request, env))) return json({ok:false,error:"No autorizado."},401);
      const id=decodeURIComponent(url.pathname.split("/").filter(Boolean)[3]||"");const rec=await loadCaseRecord(env,id);if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);
      if (env.CREDIZAS_FILES) {
        const objects=[];
        for (const kind of ["stage1","final"].filter(k=>rec?.pdfs?.[k])) objects.push({key:`cases/${id}/${kind}.pdf`,size:Number(rec?.pdf_sizes?.[kind]||0)});
        for (const doc of [...stage1DocumentEntries(rec), ...stage2DocumentEntries(rec)]) if(doc?.key) objects.push({key:doc.key,size:Number(doc?.size||0)});
        if(objects.length){const total=objects.reduce((a,x)=>a+Number(x.size||0),0),quota=await reserveR2Usage(env,{class_a:objects.length,storage_delta:-total});if(!quota.ok)return r2QuotaBlockedResponse(quota);for(const obj of objects)await env.CREDIZAS_FILES.delete(obj.key)}
      }
      if(!env.CREDIZAS_KV)return json({ok:false,error:"KV no configurado."},503);
      await env.CREDIZAS_KV.delete(CASE_PREFIX+id);
      return json({ok:true,deleted:id});
    }

    if (request.method === "GET" && url.pathname === "/api/admin/r2-quota") {
      if (!(await verifyAdmin(request, env))) return json({ ok:false, error:"No autorizado." }, 401);
      const usage = await getR2QuotaUsage(env);
      return json({ ok:true, quota_enabled:r2QuotaEnabled(env), ...usage });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/sellers") {
      if (!(await verifyAdmin(request, env))) return json({ ok:false, error:"No autorizado." }, 401);
      return json({ok:true,sellers:await listSellers(env)});
    }

    if (request.method === "GET" && url.pathname === "/api/admin/cases") {
      if (!(await verifyAdmin(request, env))) return json({ ok:false, error:"No autorizado." }, 401);
      const records = await listCaseRecords(env, { q:url.searchParams.get("q")||"", status:url.searchParams.get("status")||"", process:url.searchParams.get("process")||"", sort:url.searchParams.get("sort")||"updated_desc" });
      const sellerId=url.searchParams.get("seller_id")||"";const filtered=sellerId?records.filter(r=>String(r.vendedor_id||"")===sellerId):records;
      return json({ ok:true, cases:filtered.map(caseSummary) });
    }

    if (request.method === "PATCH" && /^\/api\/admin\/cases\/[^/]+\/control$/.test(url.pathname)) {
      if (!(await verifyAdmin(request, env))) return json({ok:false,error:"No autorizado."},401);
      const parts=url.pathname.split("/").filter(Boolean),id=decodeURIComponent(parts[3]||"");const rec=await loadCaseRecord(env,id);if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);
      const body=await request.json(),estado=String(body?.estado||""),requestedProcess=String(body?.proceso||"");let detalle=String(body?.detalle||"").trim(),procede=String(body?.procede||"").trim();
      if(!CASE_STATUSES.includes(estado))return json({ok:false,error:"Estado inválido."},400);if(!CASE_PROCESSES.includes(requestedProcess))return json({ok:false,error:"Proceso inválido."},400);
      if(["REQUIERE DATOS","RECHAZADA"].includes(estado)&&!detalle)return json({ok:false,error:"Este estado requiere un detalle."},400);
      const formalApproval=Boolean(rec.stage2)&&requestedProcess==="FORMALIZACION DE CREDITO"&&estado==="APROBADA";
      if(formalApproval&&!procede)return json({ok:false,error:"Al aprobar la Formalización indica qué procede con el cliente."},400);
      const prevEstado=rec.estado,prevProceso=rec.proceso;
      let proceso=requestedProcess;
      if(!rec.stage2&&requestedProcess==="PRECALIFICACION"&&estado==="APROBADA") proceso="FORMALIZACION DE CREDITO";
      rec.estado=estado;rec.proceso=proceso;
      if(estado==="REQUIERE DATOS")rec.ultimo_requerimiento=detalle;else if(estado!=="REINGRESADO")rec.ultimo_requerimiento="";
      if(estado==="RECHAZADA")rec.closed_at=new Date().toISOString();else delete rec.closed_at;
      if(formalApproval)rec.procede_cliente=procede;
      const ctl=currentControlForRecord(rec);if(ctl){ctl.estado=estado;ctl.proceso=proceso;ctl.detalle=detalle||null;if(formalApproval)ctl.procede=procede}
      addCaseHistory(rec,"ADMIN_CONTROL","admin",{from_state:prevEstado,to_state:estado,from_process:prevProceso,to_process:proceso,detail:detalle||null,procede:formalApproval?procede:null});await saveCaseRecord(env,rec);return json({ok:true,case:caseSummary(rec)});
    }

    if (request.method === "GET" && url.pathname === "/api/admin/export.xls") {
      if (!(await verifyAdmin(request, env))) return json({ok:false,error:"No autorizado."},401);
      const records=await listCaseRecords(env,{q:url.searchParams.get("q")||"",status:url.searchParams.get("status")||"",process:url.searchParams.get("process")||"",sort:url.searchParams.get("sort")||"updated_desc"});
      const sellerId=url.searchParams.get("seller_id")||"",filtered=sellerId?records.filter(r=>String(r.vendedor_id||"")===sellerId):records;const requested=(url.searchParams.get("fields")||"").split(",").filter(Boolean);const fields=requested.length?requested:Object.keys(ADMIN_EXPORT_FIELDS);const xml=makeExcelXml(filtered,fields);
      return new Response(xml,{headers:{"content-type":"application/vnd.ms-excel; charset=utf-8","content-disposition":`attachment; filename="CrediZas-${new Date().toISOString().slice(0,10)}.xls"`}});
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/seller/pdf/")) {
      const seller=await verifySeller(request,env);if(!seller)return json({ok:false,error:"No autorizado."},401);if(!env.CREDIZAS_FILES)return json({ok:false,error:"R2 no configurado."},503);const parts=url.pathname.split("/").filter(Boolean),id=decodeURIComponent(parts[3]||""),kind=parts[4]==="final"?"final":"stage1",rec=await loadCaseRecord(env,id);if(!rec||!sellerOwnsCase(rec,seller))return json({ok:false,error:"Expediente no autorizado."},403);const quota=await reserveR2Usage(env,{class_b:1});if(!quota.ok)return r2QuotaBlockedResponse(quota);const obj=await env.CREDIZAS_FILES.get(`cases/${id}/${kind}.pdf`);if(!obj)return json({ok:false,error:"PDF no encontrado."},404);const name=String(rec?.stage1?.data?.datos_basicos?.nombre_completo||id).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _.-]/g," ").replace(/\s+/g," ").trim();return new Response(obj.body,{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${name}.pdf"`}});
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/admin/pdf/")) {
      if (!(await verifyAdmin(request, env))) return json({ ok:false, error:"No autorizado." }, 401);
      if (!env.CREDIZAS_FILES) return json({ ok:false, error:"Configura el binding R2 CREDIZAS_FILES." }, 503);
      const parts = url.pathname.split("/").filter(Boolean);
      const id = decodeURIComponent(parts[3]||"");
      const kind = parts[4] === "final" ? "final" : "stage1";
      const quota = await reserveR2Usage(env, { class_b:1 });
      if (!quota.ok) return r2QuotaBlockedResponse(quota);
      const obj = await env.CREDIZAS_FILES.get(`cases/${id}/${kind}.pdf`);
      if (!obj) return json({ ok:false, error:"PDF no encontrado." }, 404);
      const rec = await loadCaseRecord(env,id); const name = String(rec?.stage1?.data?.datos_basicos?.nombre_completo || id).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _.-]/g," ").replace(/\s+/g," ").trim();
      return new Response(obj.body, { headers:{ "content-type":"application/pdf", "content-disposition":`attachment; filename="${name}.pdf"` } });
    }

    if (request.method === "PUT" && url.pathname.startsWith("/api/cases/") && url.pathname.includes("/pdf/")) {
      const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"No autorizado."},401);
      if (!env.CREDIZAS_FILES) return json({ ok:false, error:"Configura CREDIZAS_FILES para almacenar PDFs." }, 503);
      const parts = url.pathname.split("/").filter(Boolean);
      const id = decodeURIComponent(parts[2]||"");
      const kind = parts[4] === "final" ? "final" : "stage1";
      const pdfBytes = await request.arrayBuffer();
      const rec = await loadCaseRecord(env,id);
      if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);if(!isAdmin&&!sellerOwnsCase(rec,seller))return json({ok:false,error:"Expediente no autorizado."},403);
      if(!isAdmin&&!["SUBIDA","REINGRESADO"].includes(rec.estado))return json({ok:false,error:"El PDF está bloqueado porque el expediente ya está en revisión administrativa."},403);
      const oldSize = Number(rec?.pdf_sizes?.[kind] || 0);
      const newSize = pdfBytes.byteLength;
      const storageDelta = Math.max(0, newSize - oldSize);
      const quota = await reserveR2Usage(env, { class_a:1, storage_delta:storageDelta });
      if (!quota.ok) return r2QuotaBlockedResponse(quota);
      await env.CREDIZAS_FILES.put(`cases/${id}/${kind}.pdf`, pdfBytes, { httpMetadata:{ contentType:"application/pdf" } });
      if (rec) {
        rec.pdfs = rec.pdfs || {};
        rec.pdf_sizes = rec.pdf_sizes || {};
        rec.pdfs[kind] = true;
        rec.pdf_sizes[kind] = newSize;
        await saveCaseRecord(env,rec);
      }
      return json({ ok:true, stored_bytes:newSize });
    }

    if (request.method === "GET" && url.pathname === "/") return html(APP_HTML);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "credizas-worker-v20-sellers-admin",
        model: env.OPENAI_MODEL || MODEL_DEFAULT,
        openai_key_configured: Boolean(String(env.OPENAI_API_KEY || "").trim()),
        initial_endpoint_configured: Boolean(env.INITIAL_VALIDATION_URL),
        final_endpoint_configured: Boolean(env.FINAL_SYSTEM_URL),
        image_detail: env.IMAGE_DETAIL || "high",
        r2_quota_guard_enabled: r2QuotaEnabled(env),
        r2_quota_guard_storage_bytes: r2QuotaLimits(env).storage_bytes,
        stage1_client_conversion: "jpeg-1800px"
      });
    }

    if (request.method === "POST" && url.pathname === "/api/stage1/extract") {
      try {
        const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"Inicia sesión."},401);
        const fd = await request.formData();

        const dpiFront = fd.get("dpi_front");
        const dpiBack = fd.get("dpi_back");

        if (!(dpiFront instanceof File)) {
          return json({ ok: false, error: "Falta DPI anverso." }, 400);
        }

        if (!(dpiBack instanceof File)) {
          return json({ ok: false, error: "Falta DPI reverso." }, 400);
        }

        assertSupportedFiles([dpiFront, dpiBack], {
          imagesOnly: true,
          maxFiles: 2,
          maxEachMB: 8,
          maxTotalMB: 16
        });

        const result = await extractStage1({
          dpiFront,
          dpiBack,
          env
        });

        return json({
          ok: true,
          extraction: result.parsed,
          meta: {
            model: env.OPENAI_MODEL || MODEL_DEFAULT,
            openai_request_id: result.request_id,
            files_received: 2
          }
        });
      } catch (e) {
        console.error("stage1/extract:", e?.message || "unknown");
        return json({
          ok: false,
          error: e?.message || "Error procesando DPI."
        }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/stage1/submit") {
      try {
        const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"Inicia sesión."},401);
        const contentType=String(request.headers.get("content-type")||"");
        let payload,dpiFrontFile=null,dpiBackFile=null;
        if(contentType.includes("multipart/form-data")){
          const fd=await request.formData();
          try{payload=JSON.parse(String(fd.get("payload_json")||"{}"))}catch{return json({ok:false,error:"Payload del Paso 1 inválido."},400)}
          const f1=fd.get("dpi_front"),f2=fd.get("dpi_back");
          if(f1 instanceof File)dpiFrontFile=f1;if(f2 instanceof File)dpiBackFile=f2;
        }else{payload=await request.json()}

        const basic = payload?.datos_basicos || {};
        const comp = payload?.informacion_complementaria || {};
        const solicitud = payload?.solicitud || {};

        const requiredBasic = [
          ["nombre_completo", "Nombre completo"],
          ["numero_dpi", "Número de DPI"],
          ["fecha_nacimiento", "Fecha de nacimiento"],
          ["nit", "NIT"],
          ["numero_celular", "Número de celular"],
          ["estado_civil", "Estado civil"],
          ["genero", "Género"]
        ];

        for (const [key, label] of requiredBasic) {
          if (!basic[key]) {
            return json({ ok: false, error: "Falta: " + label + "." }, 400);
          }
        }

        if (!["SOLTERO","CASADO","VIUDO"].includes(String(basic.estado_civil || "").toUpperCase())) {
          return json({ ok:false, error:"Estado civil inválido. Usa SOLTERO, CASADO o VIUDO." }, 400);
        }
        if (!/^\d{8}$/.test(String(basic.numero_celular || ""))) {
          return json({ ok:false, error:"El celular del cliente debe tener exactamente 8 dígitos." }, 400);
        }

        if (
          basic.estado_civil === "CASADO" &&
          !basic.nombre_conyuge
        ) {
          return json({
            ok: false,
            error: "El nombre del cónyuge es obligatorio para estado civil CASADO o UNIDO."
          }, 400);
        }

        if (!solicitud?.producto_solicitado || !solicitud?.producto_sku) {
          return json({ ok:false, error:"Selecciona un producto del catálogo ZasHome." }, 400);
        }
        const catalogProduct = await findCatalogProduct(env, solicitud.producto_id, solicitud.producto_sku);
        if (!catalogProduct) return json({ ok:false, error:"No se pudo validar el producto en el catálogo activo." }, 400);
        const amount = requestedAmountFromCatalogPrice(catalogProduct.precio);
        payload.solicitud.producto_id = catalogProduct.producto_id;
        payload.solicitud.producto_sku = catalogProduct.sku;
        payload.solicitud.producto_solicitado = catalogProduct.nombre;
        payload.solicitud.producto_precio_catalogo = catalogProduct.precio;
        payload.solicitud.producto_imagen_url = catalogProduct.imagen_principal_url;
        payload.solicitud.margen_aplicado = 0.50;
        payload.solicitud.monto_total_solicitado = amount;

        const ingresoPromedio = Number(comp.ingreso_promedio_mensual);
        if (!Number.isFinite(ingresoPromedio) || ingresoPromedio <= 0) {
          return json({ ok: false, error: "Ingreso promedio mensual inválido." }, 400);
        }
        payload.informacion_complementaria.ingreso_promedio_mensual = ingresoPromedio;

        const requiredComp = [
          ["fuente_ingresos", "Fuente de ingresos"],
          ["origen_ingresos", "Origen de ingresos"],
          ["subtipo_ingreso", "Subtipo de ingreso"],
          ["tipo_vivienda", "Tipo de vivienda"],
          ["departamento", "Departamento"],
          ["municipio", "Municipio"],
          ["nivel_educacion", "Nivel de educación"]
        ];

        for (const [key, label] of requiredComp) {
          if (!comp[key]) {
            return json({ ok: false, error: "Falta: " + label + "." }, 400);
          }
        }

        payload.datos_basicos.producto_interes = "CCO ELECTRO";
        payload.informacion_complementaria =
          payload.informacion_complementaria || {};
        payload.informacion_complementaria.tipo_nacionalidad = "GUATEMALA";

        payload.reglas_etapa_2 = payload.reglas_etapa_2 || {};
        payload.reglas_etapa_2.sustento_ingresos = deriveStage2IncomeRule(
          payload.informacion_complementaria.fuente_ingresos,
          payload.informacion_complementaria.origen_ingresos
        );

        const caseId = payload?.expediente?.id || crypto.randomUUID();
        payload.expediente = payload.expediente || {};payload.expediente.id=caseId;
        const existing=await loadCaseRecord(env,caseId);
        let actorSeller=seller;
        if(isAdmin){const sid=String(payload.expediente.vendedor_id||existing?.vendedor_id||"");const sr=sid?await kvGetJson(env,SELLER_PREFIX+sid):null;if(!sr)return json({ok:false,error:"Selecciona un vendedor válido."},400);actorSeller={id:sr.id,name:sr.name}}
        payload.expediente.vendedor=actorSeller.name;payload.expediente.vendedor_id=actorSeller.id;
        if(existing&&!isAdmin&&!sellerOwnsCase(existing,actorSeller))return json({ok:false,error:"Expediente no autorizado."},403);
        if(existing&&existing.estado==="RECHAZADA")return json({ok:false,error:"El expediente está rechazado y cerrado. El administrador debe reabrirlo antes de editar."},403);
        if(existing&&!isAdmin&&(existing.proceso!=="PRECALIFICACION"||existing.estado!=="REQUIERE DATOS"))return json({ok:false,error:"Este expediente está bloqueado. El administrador debe marcar Requiere información para habilitar correcciones."},403);
        const result=await submitInitialValidation(payload,env),isCorrection=Boolean(existing);let estado=isAdmin&&existing?existing.estado:(isCorrection?"REINGRESADO":"SUBIDA");let proceso=isAdmin&&existing?existing.proceso:"PRECALIFICACION";const control1={proceso,estado,detalle:null};payload.control_etapa1=control1;
        const rec=existing||{id:caseId,created_at:new Date().toISOString()};rec.vendedor=actorSeller.name;rec.vendedor_id=actorSeller.id;rec.proceso=proceso;rec.estado=estado;rec.stage1={data:payload,control:control1,request_id:result.request_id,decision:{status:result.status,message:result.message||""},submitted_at:new Date().toISOString()};if(dpiFrontFile&&dpiBackFile){assertSupportedFiles([dpiFrontFile,dpiBackFile],{imagesOnly:true,maxFiles:2,maxEachMB:8,maxTotalMB:16});await persistStage1Documents(env,rec,caseId,{front:[dpiFrontFile],back:[dpiBackFile]})}addCaseHistory(rec,isAdmin?(isCorrection?"ADMIN_EDIT_STAGE1":"ADMIN_CREATE_STAGE1"):(isCorrection?"STAGE1_REINGRESADO":"STAGE1_SUBIDA"),isAdmin?"admin":"seller",{seller_id:actorSeller.id,seller:actorSeller.name});await saveCaseRecord(env,rec);
        return json({ok:true,result:{...result,case_id:caseId,estado,persisted:Boolean(env.CREDIZAS_KV)}});
      } catch (e) {
        return json({
          ok: false,
          error: e?.message || "Error en precalificación inicial."
        }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/stage1/simulate") {
      try {
        if(!(await verifyAdmin(request,env)))return json({ok:false,error:"Solo administrador."},401);
        const body = await request.json();
        if (!body?.request_id) return json({ ok: false, error: "Falta request_id." }, 400);
        if (!["positive", "negative"].includes(body.result)) return json({ ok: false, error: "result debe ser positive o negative." }, 400);
        const positive = body.result === "positive";
        if (body.case_id) { const rec = await loadCaseRecord(env, body.case_id); if (rec) { rec.estado = positive ? "APROBADA" : "RECHAZADA"; rec.proceso = "PRECALIFICACION"; if (rec.stage1) { rec.stage1.control = rec.stage1.control || {}; rec.stage1.control.estado = rec.estado; rec.stage1.decision = { status: positive ? "VALIDACION_POSITIVA" : "VALIDACION_NEGATIVA", message: positive ? "Aprobada" : "Rechazada" }; } await saveCaseRecord(env, rec); } }
        return json({
          ok: true,
          response: {
            simulation: true,
            request_id: body.request_id,
            status: positive ? "VALIDACION_POSITIVA" : "VALIDACION_NEGATIVA",
            can_continue: positive,
            message: positive ? "Precalificación positiva. Cliente habilitado para continuar al proceso 2." : "Precalificación negativa. El flujo se detiene en esta simulación.",
            simulated_at: new Date().toISOString()
          }
        });
      } catch (e) {
        return json({ ok: false, error: e?.message || "Error de simulación." }, 400);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/stage2/extract") {
      try {
        const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"Inicia sesión."},401);
        const fd = await request.formData();
        const selfieFile = fd.get("selfie");
        const utilityFiles = fd.getAll("utility_files").filter(v => v instanceof File);
        const incomeFiles = fd.getAll("income_files").filter(v => v instanceof File);

        if (!(selfieFile instanceof File)) {
          return json({ ok: false, error: "Falta la selfie del cliente sosteniendo su DPI." }, 400);
        }
        if (!utilityFiles.length) {
          return json({ ok: false, error: "Sube recibo de luz, agua o constancia municipal." }, 400);
        }

        const caseId=String(fd.get("case_id")||"");const rec=await loadCaseRecord(env,caseId);if(!rec)return json({ok:false,error:"Expediente no encontrado."},404);if(!isAdmin&&!sellerOwnsCase(rec,seller))return json({ok:false,error:"Expediente no autorizado."},403);if(rec.estado==="RECHAZADA")return json({ok:false,error:"El expediente está rechazado y cerrado."},403);if(rec.proceso!=="FORMALIZACION DE CREDITO")return json({ok:false,error:"El administrador todavía no ha habilitado la Formalización de crédito."},403);if(!isAdmin&&rec.stage2&&rec.estado!=="REQUIERE DATOS")return json({ok:false,error:"El Paso 2 está bloqueado. El administrador debe marcar Requiere información para corregirlo."},403);
        const stage1Data = rec.stage1?.data || {};

        const source = stage1Data?.informacion_complementaria?.fuente_ingresos;
        const origin = stage1Data?.informacion_complementaria?.origen_ingresos;
        const subtype = stage1Data?.informacion_complementaria?.subtipo_ingreso;
        const policy = getIncomeSupportPolicy(source, origin, subtype);

        if (policy.required && !incomeFiles.length) {
          return json({ ok: false, error: policy.title + ". " + policy.guidance }, 400);
        }

        assertSupportedFiles([selfieFile], { imagesOnly: true, maxFiles: 1, maxEachMB: 8, maxTotalMB: 8 });
        assertSupportedFiles(utilityFiles, { maxFiles: 3, maxEachMB: 12, maxTotalMB: 24 });
        if (incomeFiles.length) {
          assertSupportedFiles(incomeFiles, { maxFiles: 4, maxEachMB: 12, maxTotalMB: 30 });
        }

        await persistStage2Documents(env, rec, caseId, { selfie:[selfieFile], utility:utilityFiles, income:incomeFiles });
        await saveCaseRecord(env, rec);
        const result = await extractStage2({ selfieFile, utilityFiles, incomeFiles, stage1Data, env });
        rec.stage2_draft = { extraction:result.parsed, analyzed_at:new Date().toISOString() };
        await saveCaseRecord(env, rec);
        return json({
          ok: true,
          extraction: result.parsed,
          documents: rec.stage2_documents || null,
          meta: {
            model: env.OPENAI_MODEL || MODEL_DEFAULT,
            openai_request_id: result.request_id,
            income_support_required: policy.required,
            income_support_rule: policy.code
          }
        });
      } catch (e) {
        console.error("stage2/extract:", e?.message || "unknown");
        return json({ ok: false, error: e?.message || "Error procesando documentos del Paso 2." }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/final/submit") {
      try {
        const seller=await verifySeller(request,env);const isAdmin=await verifyAdmin(request,env);if(!seller&&!isAdmin)return json({ok:false,error:"Inicia sesión."},401);
        const payload = await request.json();
        if (!payload?.workflow?.reviewed_by_user) return json({ ok: false, error: "Falta confirmación de revisión humana." }, 400);
        const caseId=payload?.stage1?.expediente?.id||payload?.stage2?.expediente?.id;const existing=await loadCaseRecord(env,caseId);if(!existing)return json({ok:false,error:"Expediente no encontrado."},404);if(!isAdmin&&!sellerOwnsCase(existing,seller))return json({ok:false,error:"Expediente no autorizado."},403);if(existing.estado==="RECHAZADA")return json({ok:false,error:"El expediente está rechazado y cerrado."},403);if(existing.proceso!=="FORMALIZACION DE CREDITO")return json({ok:false,error:"El administrador todavía no habilita el Paso 2."},403);if(!isAdmin&&existing.stage2&&existing.estado!=="REQUIERE DATOS")return json({ok:false,error:"El Paso 2 está bloqueado hasta que el administrador solicite información."},403);
        const s2data=payload?.stage2||{},s1data=existing?.stage1?.data||{},dom=s2data.domicilio||{},dig=s2data.digitacion||{};
        if(!dom.direccion_completa)return json({ok:false,error:"Hace falta la dirección completa del domicilio."},400);
        const source=s1data?.informacion_complementaria?.fuente_ingresos||"",origin=s1data?.informacion_complementaria?.origen_ingresos||"";
        const companyGroup=(source==="SALARIO"&&origin==="SALARIO FORMAL")||(source==="RENTAS"&&origin==="JUBILADO");
        const requiredWork=companyGroup?["nombre_empresa","direccion_empresa","telefono_empresa","antiguedad"]:["giro_oficio","direccion_empresa","telefono_empresa","antiguedad"];
        for(const k of requiredWork)if(!String(dig?.[k]??"").trim())return json({ok:false,error:"Falta completar un dato obligatorio de "+(companyGroup?"empresa/institución":"actividad/oficio/remesas")+"."},400);
        const storedDocs=existing.stage2_documents||{},policy=getIncomeSupportPolicy(source,origin,s1data?.informacion_complementaria?.subtipo_ingreso||"");
        if(!(storedDocs.selfie||[]).length)return json({ok:false,error:"Falta la selfie con DPI guardada en el expediente."},400);
        if(!(storedDocs.utility||[]).length)return json({ok:false,error:"Falta el documento de domicilio guardado en el expediente."},400);
        if(policy.required&&!(storedDocs.income||[]).length)return json({ok:false,error:"Falta el sustento de ingresos obligatorio guardado en el expediente."},400);
        const phone = s2data?.digitacion?.telefono_empresa;
        if (phone && !/^\d{8}$/.test(String(phone))) return json({ ok:false, error:"El teléfono de empresa/actividad debe tener exactamente 8 dígitos." }, 400);
        for (const [i, ref] of (payload?.stage2?.referencias || []).entries()) {
          if (!/^\d{8}$/.test(String(ref?.celular || ""))) return json({ ok:false, error:`Referencia ${i+1}: el celular debe tener exactamente 8 dígitos.` }, 400);
        }
        const actorSeller=isAdmin?{id:existing.vendedor_id,name:existing.vendedor}:seller;payload.stage2.expediente={id:caseId,vendedor:actorSeller.name,vendedor_id:actorSeller.id};const isCorrection=Boolean(existing.stage2);let estado=isAdmin&&isCorrection?existing.estado:(isCorrection?"REINGRESADO":"SUBIDA"),control2={proceso:"FORMALIZACION DE CREDITO",estado,detalle:null};payload.stage2.control_etapa2=control2;const result=await submitFinal(payload,env);existing.proceso="FORMALIZACION DE CREDITO";existing.estado=estado;existing.stage2={data:payload.stage2,control:control2,extraction:existing.stage2_draft?.extraction||existing.stage2?.extraction||null,submitted_at:new Date().toISOString()};addCaseHistory(existing,isAdmin?(isCorrection?"ADMIN_EDIT_STAGE2":"ADMIN_CREATE_STAGE2"):(isCorrection?"STAGE2_REINGRESADO":"STAGE2_SUBIDA"),isAdmin?"admin":"seller",{seller_id:actorSeller.id,seller:actorSeller.name});await saveCaseRecord(env,existing);return json({ok:true,result:{...result,case_id:caseId,estado,persisted:Boolean(env.CREDIZAS_KV)}});
      } catch (e) {
        return json({ ok: false, error: e?.message || "Error en envío final." }, 500);
      }
    }

    return json({ ok: false, error: "Not found" }, 404);
  }
};
