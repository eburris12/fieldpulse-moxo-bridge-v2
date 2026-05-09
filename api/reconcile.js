import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  try {
    // In real life, this would call FieldPulse API
    // For now we simulate “source of truth”

    const externalJobs = [
      {
        id: "FP-1001",
        status: "On the Way",
        technician_name: "John Smith"
      },
      {
        id: "FP-1002",
        status: "Completed",
        technician_name: "Mike Johnson"
      }
    ];

    const results = [];

    for (const job of externalJobs) {
      const { data: existing } = await supabase
        .from("jobs")
        .select("*")
        .eq("job_id", job.id)
        .single();

      // If missing → insert
      if (!existing) {
        await supabase.from("jobs").insert({
          job_id: job.id,
          status: job.status,
          technician_name: job.technician_name,
          updated_at: new Date().toISOString()
        });

        results.push({ job: job.id, action: "inserted" });
        continue;
      }

      // If mismatch → fix drift
      const needsUpdate =
        existing.status !== job.status ||
        existing.technician_name !== job.technician_name;

      if (needsUpdate) {
        await supabase
          .from("jobs")
          .update({
            status: job.status,
            technician_name: job.technician_name,
            updated_at: new Date().toISOString()
          })
          .eq("job_id", job.id);

        results.push({ job: job.id, action: "updated" });
      } else {
        results.push({ job: job.id, action: "ok" });
      }
    }

    return res.json({
      success: true,
      results
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
