// sharepinz-worker.js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { BUCKET } = env;

    // ---------- 1. UPLOAD ----------
    if (url.pathname === "/upload" && request.method === "POST") {
      const formData = await request.formData();
      const pin = formData.get("pin");
      if (!pin) return new Response("Missing pin", { status: 400 });

      // multiple "file" fields allowed
      for (const [key, value] of formData.entries()) {
        if (key !== "file") continue;

        const storedName = `${Date.now()}-${value.name}`;
        const objectKey = `${pin}/${storedName}`;

        await BUCKET.put(objectKey, value.stream(), {
          httpMetadata: {
            contentType: value.type || "application/octet-stream",
          },
        });
      }

      return json({ ok: true });
    }

    // ---------- 2. LIST FILES BY PIN ----------
    if (url.pathname === "/list" && request.method === "GET") {
      const pin = url.searchParams.get("pin");
      if (!pin) return new Response("Missing pin", { status: 400 });

      const list = await BUCKET.list({ prefix: `${pin}/` });
      const items = list.objects.map((obj) => {
        const storedName = obj.key.replace(`${pin}/`, "");
        const idx = storedName.indexOf("-");
        const displayName = idx === -1 ? storedName : storedName.slice(idx + 1);
        return {
          storedName,
          displayName,
          size: obj.size,
        };
      });

      if (!items.length) {
        return new Response("No files for this PIN", { status: 404 });
      }

      return json({ items });
    }

    // ---------- 3. DOWNLOAD SINGLE FILE ----------
    if (url.pathname === "/file" && request.method === "GET") {
      const pin = url.searchParams.get("pin");
      const storedName = url.searchParams.get("name");
      if (!pin || !storedName) {
        return new Response("Missing params", { status: 400 });
      }

      const objectKey = `${pin}/${storedName}`;
      const obj = await BUCKET.get(objectKey);
      if (!obj) {
        return new Response("Not found", { status: 404 });
      }

      // R2 lifecycle rule already deletes after 1 day.
      // If object exists, just return it.
      return new Response(obj.body, {
        headers: obj.httpMetadata || {},
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
