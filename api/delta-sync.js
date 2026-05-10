import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  try {
    // =====================================================
    // 1. GET WATERMARK
    // =====================================================
    const { data: state, error: stateError } = await supabase
      .from("sync_state")
      .select("*")
      .eq("id", 1)
      .single();

    if (stateError) {
      return res.status(500).json({ error: stateError.message });
    }

    const lastSyncRaw = state?.last_sync || "1970-01-01T00:00:00Z";
    const lastSync = new Date(lastSyncRaw);

    // =====================================================
    // 2. MOCK EXTERNAL SYSTEM (your test source)
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

    // track newest external timestamp
    let maxExternalTime = lastSync;

    // =====================================================
    // 3. PROCESS JOBS
    // =====================================================
    for (const ext of externalJobs) {

      const jobId = String(ext.id);

      const extRaw = ext.updated_at;
      const extTime = new Date(extRaw);

      // =========================
      // HARD DEBUG OUTPUT
      // =========================
      console.log("\n===== DELTA DEBUG =====");
      console.log("JOB ID:", jobId);
      console.log("RAW EXTERNAL:", extRaw);
      console.log("PARSED EXTERNAL:", extTime.toISOString());
      console.log("RAW LAST SYNC:", lastSyncRaw);
      console.log("PARSED LAST SYNC:", lastSync.toISOString());
      console.log("IS NEWER?:", extTime > lastSync);

      // =========================
      // SKIP IF NOT NEWER
      // =========================
      if (extTime <= lastSync) {
        results.push({
          job: jobId,
          action: "skipped_not_changed"
        });
        continue;
      }

      // track max timestamp
      if (extTime > maxExternalTime) {
        maxExternalTime = extTime;
      }

      // =========================
      // FETCH LOCAL JOB
      // =========================
      const { data: local, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      // =========================
      // INSERT
      // =========================
      if (!local) {
        await supabase.from("jobs").insert({
          job_id: jobId,
          status: ext.status,
          technician_name: ext.technician_name,
          updated_at: extRaw
        });

        results.push({
          job: jobId,
          action: "inserted"
        });

        continue;
      }

      // =========================
      // COMPARE FIELDS
      // =========================
      const changes = {};

      if (local.status !== ext.status) {
        changes.status = ext.status;
      }

      if (local.technician_name !== ext.technician_name) {
        changes.technician_name = ext.technician_name;
      }

      // =========================
      // NO CHANGE
      // =========================
      if (Object.keys(changes).length === 0) {
        results.push({
          job: jobId,
          action: "no_change"
        });
        continue;
      }

      // =========================
      // UPDATE
      // =========================
      await supabase
        .from("jobs")
        .update({
          ...changes,
          updated_at: extRaw
        })
        .eq("job_id", jobId);

      results.push({
        job: jobId,
        action: "updated",
        changes
      });
    }

    // =====================================================
    // 4. UPDATE WATERMARK (CORRECT LOGIC)
    // =====================================================
    const newWatermark = maxExternalTime.toISOString();

    console.log("\n===== WATERMARK UPDATE =====");
    console.log("OLD:", lastSyncRaw);
    console.log("NEW:", newWatermark);

    await supabase
      .from("sync_state")
      .update({
        last_sync: newWatermark
      })
      .eq("id", 1);

    // =====================================================
    // 5. RESPONSE
    // =====================================================
    return res.json({
      success: true,
      lastSync: lastSyncRaw,
      newWatermark,
      results
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
