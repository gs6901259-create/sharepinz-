export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Basic CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    try {
      if (request.method === "POST" && pathname === "/api/upload") {
        return handleUpload(request, env);
      }

      if (request.method === "GET" && pathname.startsWith("/api/files/")) {
        const pin = pathname.split("/").pop();
        return handleListFiles(pin, env);
      }

      if (request.method === "GET" && pathname.startsWith("/api/download/")) {
        const parts = pathname.split("/");
        const pin = parts[3];
        const key = decodeURIComponent(parts.slice(4).join("/"));
        return handleDownload(pin, key, env);
      }

      if (request.method === "DELETE" && pathname.startsWith("/api/files/")) {
        const parts = pathname.split("/");
        const pin = parts[3];
        return handleDelete(pin, env);
      }

      return new Response("Not found", { status: 404, headers: corsHeaders() });
    } catch (err) {
      console.error(err);
      return new Response("Server error", { status: 500, headers: corsHeaders() });
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function handleUpload(request, env) {
  const formData = await request.formData();
  const files = formData.getAll("files");
  if (!files || files.length === 0) {
    return new Response("No files", { status: 400, headers: corsHeaders() });
  }

  let pin = formData.get("pin");
  if (!pin) {
    pin = generatePin();
  }

  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const key = `${pin}/${crypto.randomUUID()}_${file.name}`;

    await env.SHAREPIN_BUCKET.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: {
        originalName: file.name,
        pin,
        expiresAt: String(expiresAt),
      },
    });
  }

  return new Response(JSON.stringify({ pin }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

async function handleListFiles(pin, env) {
  if (!pin) {
    return new Response("Pin required", { status: 400, headers: corsHeaders() });
  }

  const list = await env.SHAREPIN_BUCKET.list({ prefix: `${pin}/` });
  const now = Date.now();
  const files = [];

  for (const obj of list.objects) {
    const meta = obj.customMetadata || {};
    const expiresAt = Number(meta.expiresAt || 0);

    // Auto-delete expired objects
    if (expiresAt && now > expiresAt) {
      await env.SHAREPIN_BUCKET.delete(obj.key);
      continue;
    }

    files.push({
      key: obj.key,
      name: meta.originalName || obj.key.split("/").pop(),
      size: obj.size,
    });
  }

  return new Response(JSON.stringify({ files }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

async function handleDownload(pin, key, env) {
  if (!pin || !key || !key.startsWith(`${pin}/`)) {
    return new Response("Invalid key", { status: 400, headers: corsHeaders() });
  }

  const object = await env.SHAREPIN_BUCKET.get(key);
  if (!object) {
    return new Response("Not found", { status: 404, headers: corsHeaders() });
  }

  const meta = object.customMetadata || {};
  const expiresAt = Number(meta.expiresAt || 0);
  const now = Date.now();

  if (expiresAt && now > expiresAt) {
    await env.SHAREPIN_BUCKET.delete(key);
    return new Response("Expired", { status: 410, headers: corsHeaders() });
  }

  const body = object.body;
  const originalName = meta.originalName || key.split("/").pop();

  const headers = {
    "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(originalName)}"`,
    ...corsHeaders(),
  };

  return new Response(body, { status: 200, headers });
}

async function handleDelete(pin, env) {
  if (!pin) {
    return new Response("Pin required", { status: 400, headers: corsHeaders() });
  }

  const list = await env.SHAREPIN_BUCKET.list({ prefix: `${pin}/` });
  for (const obj of list.objects) {
    await env.SHAREPIN_BUCKET.delete(obj.key);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
