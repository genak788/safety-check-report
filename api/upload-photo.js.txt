import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`;

    // Upload ke bucket Supabase
    const { error: uploadError } = await supabase.storage
      .from("safety-photos")
      .upload(fileName, buffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Ambil URL publiknya
    const { data } = supabase.storage
      .from("safety-photos")
      .getPublicUrl(fileName);

    res.status(200).json({ url: data.publicUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
