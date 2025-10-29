// api/test-checkers.js
import { createClient } from '@supabase/supabase-js'

// 🔑 Inisialisasi Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// 🔍 Endpoint: tes relasi antara reports dan checkers
export default async function handler(req, res) {
  try {
    const { report_id } = req.query

    if (!report_id) {
      return res.status(400).json({ error: 'Missing report_id query parameter' })
    }

    // Ambil data laporan dan semua checkers-nya
    const { data, error } = await supabase
      .from('reports')
      .select(`
        id,
        project_name,
        date,
        checkers (
          id,
          name
        )
      `)
      .eq('id', report_id)
      .single()

    if (error) {
      console.error('Supabase error:', error)
      throw error
    }

    // ✅ Kirim hasil ke browser
    return res.status(200).json({
      success: true,
      report: data
    })

  } catch (err) {
    console.error('Server error:', err)
    return res.status(500).json({
      success: false,
      error: err.message
    })
  }
}
