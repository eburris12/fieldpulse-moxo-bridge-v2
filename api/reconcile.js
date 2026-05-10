import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  try {
    // =====================================================
    // SINGLE EXTERNAL JOB (SIMULATED FIELD SYSTEM)
    // =====================================================
    const externalJob = {
      id: "FP-1001",
      status: "On the Way",
      technician_name: "John Smith",
      updated_at: "2026-05-09T20:00:00Z"
    };

    const jobId = String(externalJob.id).trim();

    // =========================================
    // FETCH LOCAL JOB
    // =========================================
    const { data: local, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const results = [];

    // =========================================
    // 1. INSERT IF MISSING
    // =========================================
    if (!local) {
      await supabase.from("jobs").insert({
        job_id: jobId,
        status: externalJob.status,
        technician_name: externalJob.technician_name,
        updated_at: externalJob.updated_at
      });

      return res.json({
        success: true,
        job: jobId,
        action: "inserted"
      });
    }

    // =========================================
    // 2. TIMESTAMP AUTHORITY CHECK
    // =========================================
    const localTime = new Date(local.updated_at || 0);
    const externalTime = new Date(externalJob.updated_at);

    if (localTime >= externalTime) {
      return res.json({
        success: true,
        job: jobId,
        action: "skipped_local_newer"
      });
    }

    // =========================================
    // 3. FIELD DIFFERENCE CHECK
    // =========================================
    const changes = {};

    if (local.status !== externalJob.status) {
      changes.status = externalJob.status;
    }

    if (local.technician_name !== externalJob.technician_name) {
      changes.technician_name = externalJob.technician_name;
    }

    // =========================================
    // 4. APPLY UPDATE ONLY IF NEEDED
    // =========================================
    if (Object.keys(changes).length === 0) {
      return res.json({
        success: true,
        job: jobId,
        action: "ok"
      });
    }

    await supabase
      .from("jobs")
      .update({
        ...changes,
        updated_at: externalJob.updated_at
      })
      .eq("job_id", jobId);

    return res.json({
      success: true,
      job: jobId,
      action: "updated",
      changes
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
