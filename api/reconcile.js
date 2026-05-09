import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  try {
    // Simulated external system (FieldPulse equivalent)
    const externalJobs = [
      {
        id: "FP-1001",
        status: "On the Way",
        technician_name: "John Smith",
        updated_at: "2026-05-09T18:00:00Z"
      },
      {
        id: "FP-1002",
        status: "Completed",
        technician_name: "Mike Johnson",
        updated_at: "2026-05-09T19:00:00Z"
      }
    ];

    const results = [];

    for (const job of externalJobs) {
      const { data: existing } = await supabase
        .from("jobs")
        .select("*")
        .eq("job_id", job.id)
        .single();

      // -----------------------------
      // 1. INSERT IF MISSING
      // -----------------------------
      if (!existing) {
        await supabase.from("jobs").insert({
          job_id: job.id,
          status: job.status,
          technician_name: job.technician_name,
          updated_at: job.updated_at
        });

        results.push({ job: job.id, action: "inserted" });
        continue;
      }

      // -----------------------------
      // 2. COMPARE SAFELY (NO BLIND OVERWRITE)
      // -----------------------------
      const dbUpdated = new Date(existing.updated_at || 0);
      const extUpdated = new Date(job.updated_at || 0);

      const changes = {};

      // Only update if EXTERNAL is newer
      if (extUpdated > dbUpdated) {

        if (existing.status !== job.status) {
          changes.status = job.status;
        }

        if (existing.technician_name !== job.technician_name) {
          changes.technician_name = job.technician_name;
        }

        // Only apply update if there are real differences
        if (Object.keys(changes).length > 0) {
          await supabase
            .from("jobs")
            .update({
              ...changes,
              updated_at: job.updated_at
            })
            .eq("job_id", job.id);

          results.push({ job: job.id, action: "updated", changes });
        } else {
          results.push({ job: job.id, action: "ok" });
        }

      } else {
        // DB is newer → do nothing
        results.push({ job: job.id, action: "skipped_newer_local" });
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
