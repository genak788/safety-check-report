import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false
  }
};

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const data = [];
    req.on("data", chunk => data.push(chunk));
    req.on("end", () => resolve(Buffer.concat(data)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  try {
    const raw = await parseForm(req);
    const boundary = req.headers["content-type"].split("boundary=")[1];
    const parts = raw.toString().split("--" + boundary);

    let fields = {};
    let excelBuffer;
    let photos = [];

    for (let part of parts) {
      if (part.includes("Content-Disposition") && part.includes("filename=")) {
        const filename = part.match(/filename="(.+?)"/)[1];
        const fileData = part.split("\r\n\r\n")[1].replace(/\r\n--$/, "");
        const buffer = Buffer.from(fileData, "binary");

        if (filename.endsWith(".xlsx")) {
          excelBuffer = buffer;
        } else {
          photos.push({ filename, buffer });
        }
      } else if (part.includes("Content-Disposition") && part.includes("name=")) {
        const name = part.match(/name="(.+?)"/)[1];
        const value = part.split("\r\n\r\n")[1]?.replace(/\r\n--$/, "");
        fields[name] = value;
      }
    }

    const workbook = XLSX.read(excelBuffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Upload Photos
    let photoURLMap = {};
    for (const photo of photos) {
      const filePath = `reports/${uuidv4()}-${photo.filename}`;
      await supabase.storage.from("inspection-images").upload(filePath, photo.buffer);
      const { data } = supabase.storage.from("inspection-images").getPublicUrl(filePath);
      photoURLMap[photo.filename] = data.publicUrl;
    }

    // Group Data
    let reportData = {};
    rows.forEach(r => {
      if (!reportData[r["Unit Lift"]]) reportData[r["Unit Lift"]] = { spare: [], work: [] };

      const entry = {
        item: r["Item / Pemeriksaan"],
        kondisi: r["Kondisi"],
        ket: r["Jumlah / Keterangan"],
        remarks: r["Remarks"],
        prioritas: r["Prioritas"],
        photos: []
      };

      if (r["Foto Nama File"] && photoURLMap[r["Foto Nama File"]]) {
        entry.photos.push(photoURLMap[r["Foto Nama File"]]);
      }

      if (r["Jenis"] === "SparePart") reportData[r["Unit Lift"]].spare.push(entry);
      else reportData[r["Unit Lift"]].work.push(entry);
    });

    const { data, error } = await supabase
      .from("safety_reports")
      .insert({
        project_name: fields.project_name,
        date: fields.date,
        checker1: fields.checker1,
        checker2: fields.checker2,
        checker3: fields.checker3,
        findings: reportData
      })
      .select()
      .single();

    return res.json({ status: "ok", id: data.id });

  } catch (err) {
    return res.json({ status: "error", message: err.toString() });
  }
}
