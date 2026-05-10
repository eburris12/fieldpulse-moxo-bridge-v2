import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  try {

    // =========================================
    // 1. GET LAST SYNC TIME
    // =========================================
    const { data: state } = await supabase
      .from("sync_state")
      .select("*")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    const lastSync = state?.last_sync || "1970-02-01T00:00:00Z";

    // =========================================
    // 2. SIMULATED EXTERNAL API (DELTA ONLY)
    // Replace later with FieldPulse API filter
    // =========================================
    const externalJobs = [
      {
        id: "FP-1001",
        status: "On the Way",
        technician_name: "John Smith",
        updated_at: "2026-05-11T00:00:00Z"
      },
      {
        id: "FP-1002",
        status: "Completed",
        technician_name: "Mike Johnson",
        updated_at: "2026-05-11T00:00:00Z"
      }
    ];

    const results = [];

    // =========================================
    // 3. ONLY PROCESS CHANGED RECORDS
    // =========================================
    for (const job of externalJobs) {

      const jobTime = new Date(job.updated_at);
      const syncTime = new Date(lastSync);

      // SKIP UNCHANGED
      if (jobTime <= syncTime) {
        results.push({
          job: job.id,
          action: "skipped_not_changed"
        });
        continue;
      }

      const jobId = String(job.id).trim();

      const { data: existing } = await supabase
        .from("jobs")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();

      // =========================================
      // INSERT IF MISSING
      // =========================================
      if (!existing) {
        await supabase.from("jobs").insert({
          job_id: jobId,
          status: job.status,
          technician_name: job.technician_name,
          updated_at: job.updated_at
        });

        results.push({
          job: jobId,
          action: "inserted"
        });

        continue;
      }

      // =========================================
      // UPDATE IF DIFFERENT
      // =========================================
      const changes = {};

      if (existing.status !== job.status) {
        changes.status = job.status;
      }

      if (existing.technician_name !== job.technician_name) {
        changes.technician_name = job.technician_name;
      }

      if (Object.keys(changes).length > 0) {
        await supabase
          .from("jobs")
          .update({
            ...changes,
            updated_at: job.updated_at
          })
          .eq("job_id", jobId);

        results.push({
          job: jobId,
          action: "updated",
          changes
        });

      } else {
        results.push({
          job: jobId,
          action: "no_change"
        });
      }
    }

    // =========================================
    // 4. UPDATE SYNC WATERMARK
    // =========================================
    await supabase
      .from("sync_state")
      .update({ last_sync: new Date().toISOString() })
      .eq("id", state.id);

    return res.json({
      success: true,
      lastSync,
      results
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
