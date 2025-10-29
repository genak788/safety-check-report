import { createClient } from "@supabase/supabase-js";
import PDFDocument from "pdfkit";
import getStream from "get-stream";
import axios from "axios/dist/node/axios.cjs";


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { report_id } = req.query;
    if (!report_id) return res.status(400).json({ error: "report_id is required" });

    // 1️⃣ Ambil data laporan dari Supabase
    const { data: report, error } = await supabase
      .from("reports")
      .select("*, lifts(*, items(*, photos(*)))")
      .eq("id", report_id)
      .single();

    if (error) throw error;
    if (!report) return res.status(404).json({ error: "Report not found" });

    // 2️⃣ Buat PDF
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const stream = doc.pipe(res);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=SafetyCheckReport_${report_id}.pdf`
    );

    // === HEADER ===
    const logoLeft =
      "https://raw.githubusercontent.com/genak788/safety-check-report/main/logo%20jk.jpg";
    const logoRight =
      "https://raw.githubusercontent.com/genak788/safety-check-report/main/7c24cbb6-99ec-4c54-9151-2db44b7ff0cb.png";

    const [left, right] = await Promise.all([
      axios.get(logoLeft, { responseType: "arraybuffer" }).then((r) => r.data),
      axios.get(logoRight, { responseType: "arraybuffer" }).then((r) => r.data),
    ]);

    doc.image(left, 50, 30, { width: 70 });
    doc.image(right, 470, 30, { width: 70 });
    doc.moveDown(3);

    doc.fontSize(16).text("SAFETY CHECK REPORT", { align: "center", underline: true });
    doc.moveDown(1.5);

    // === INFO LAPORAN ===
    doc.fontSize(10);
    doc.text(`Nama Project: ${report.project_name}`);
    doc.text(`Tanggal: ${report.date}`);
    doc.text(`Checker: ${(report.checkers || []).join(", ")}`);
    doc.moveDown(1);

    // === TABEL PER LIFT ===
    for (const lift of report.lifts) {
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Lift: ${lift.lift_name}`, { underline: true });
      doc.fontSize(10);
      doc.text(`Tipe: ${lift.type || "-"} | Manufacturer: ${lift.manufacturer || "-"}`);
      doc.moveDown(0.5);

      // Filter kategori
      const categories = ["Spare Part", "Pekerjaan"];
      for (const cat of categories) {
        const items = lift.items.filter((i) => i.category === cat);
        if (items.length === 0) continue;

        doc.fontSize(11).text(cat, { bold: true });
        doc.moveDown(0.3);
        doc.fontSize(9);

        const headers = ["Nama Item", "Kondisi", "Jumlah", "Satuan", "Catatan", "Prioritas"];
        const colX = [40, 160, 240, 290, 340, 460];

        // Header
        doc.font("Helvetica-Bold");
        headers.forEach((h, i) =>
          doc.text(h, colX[i], doc.y, { continued: i < headers.length - 1 })
        );
        doc.moveDown(0.2);
        doc.font("Helvetica");

        // Data rows
        items.forEach((item) => {
          const y = doc.y;
          const row = [
            item.name,
            item.condition,
            item.qty,
            item.unit || "",
            item.remark,
            item.priority,
          ];
          row.forEach((val, i) =>
            doc.text(val || "-", colX[i], y, { continued: i < row.length - 1 })
          );
          doc.moveDown(0.2);
        });

        doc.moveDown(0.5);
      }
    }

    // === LAMPIRAN FOTO ===
    doc.addPage();
    doc.fontSize(14).text("Lampiran Foto", { align: "center" });
    doc.moveDown(1);

    for (const lift of report.lifts) {
      doc.fontSize(12).text(`Lift: ${lift.lift_name}`, { underline: true });
      for (const item of lift.items) {
        if (!item.photos || item.photos.length === 0) continue;
        doc.moveDown(0.5);
        doc.fontSize(10).text(`${item.name}`);
        let x = 50;
        let y = doc.y + 10;
        for (const photo of item.photos) {
          try {
            const img = await axios
              .get(photo.url, { responseType: "arraybuffer" })
              .then((r) => r.data);
            doc.image(img, x, y, { width: 200 });
            x += 220;
            if (x > 400) {
              x = 50;
              y += 160;
            }
          } catch {
            doc.text("(Foto tidak dapat dimuat)");
          }
        }
        doc.moveDown(5);
      }
    }

    doc.end();
    await getStream.buffer(stream);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
