import { supabase } from "../lib/supabase";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { trigger, data } = req.body;

  try {
    const job = data?.object || data;

    const { error } = await supabase.from("jobs").upsert({
      job_id: job.id,
      status: job.status || "Unknown",
      updated_at: new Date().toISOString()
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      trigger
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
