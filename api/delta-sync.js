import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  try {
    // =====================================================
    // 1. GET LAST SYNC (WATERMARK)
    // =====================================================
    const { data: state, error: stateError } = await supabase
      .from("sync_state")
      .select("*")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (stateError) {
      return res.status(500).json({ error: stateError.message });
    }

    const lastSync = state?.last_sync
      ? new Date(state.last_sync)
      : new Date("1970-01-01T00:00:00Z");

    // =====================================================
    // 2. MOCK EXTERNAL SYSTEM (replace later with API)
    // =====================================================
    const externalJobs = [
      {
        id: "FP-1001",
        status: "On the Way",
        technician_name: "John Smith",
        updated_at: "2026-05-12T00:00:00Z"
      }
    ];

    const results = [];

    // Track newest external timestamp (IMPORTANT FIX)
    let maxExternalTime = null;

    // =====================================================
    // 3. PROCESS EACH EXTERNAL JOB
    // =====================================================
    for (const ext of externalJobs) {

      const jobId = String(ext.id).trim();
      const extTime = new Date(ext.updated_at);

      // Track max timestamp for watermark update
      if (!maxExternalTime || extTime > maxExternalTime) {
        maxExternalTime = extTime;
      }

      console.log("---- DELTA SYNC DEBUG ----");
      console.log("JOB:", jobId);
      console.log("LAST SYNC:", lastSync.toISOString());
      console.log("EXTERNAL:", ext.updated_at);

      // =========================================
      // 3A. SKIP IF NOT NEWER THAN LAST SYNC
      // =========================================
      if (extTime <= lastSync) {
        results.push({
          job: jobId,
          action: "skipped_not_changed"
        });
        continue;
      }

      // =========================================
      // 3B. FETCH LOCAL JOB
      // =========================================
      const { data: local, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      // =========================================
      // 3C. INSERT IF MISSING
      // =========================================
      if (!local) {
        await supabase.from("jobs").insert({
          job_id: jobId,
          status: ext.status,
          technician_name: ext.technician_name,
          updated_at: ext.updated_at
        });

        results.push({
          job: jobId,
          action: "inserted"
        });

        continue;
      }

      // =========================================
      // 3D. COMPARE FIELDS
      // =========================================
      const changes = {};

      if (local.status !== ext.status) {
        changes.status = ext.status;
      }

      if (local.technician_name !== ext.technician_name) {
        changes.technician_name = ext.technician_name;
      }

      // =========================================
      // 3E. UPDATE ONLY IF DIFFERENT
      // =========================================
      if (Object.keys(changes).length === 0) {
        results.push({
          job: jobId,
          action: "no_change"
        });
        continue;
      }

      await supabase
        .from("jobs")
        .update({
          ...changes,
          updated_at: ext.updated_at
        })
        .eq("job_id", jobId);

      results.push({
        job: jobId,
        action: "updated",
        changes
      });
    }

    // =====================================================
    // 4. FIXED WATERMARK UPDATE (CRITICAL FIX)
    // =====================================================
    if (maxExternalTime) {
      await supabase
        .from("sync_state")
        .update({
          last_sync: maxExternalTime.toISOString()
        })
        .eq("id", state.id);
    }

    // =====================================================
    // 5. RESPONSE
    // =====================================================
    return res.json({
      success: true,
      lastSync: state.last_sync,
      results
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
