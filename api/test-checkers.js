import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {
    const { report_id } = req.query;

    const { data, error } = await supabase
      .from('reports')
      .select(`
        *,
        checkers (id, name)
      `)
      .eq('id', report_id)
      .single();

    if (error) throw error;

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
