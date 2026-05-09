import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { trigger, data } = req.body || {};

    const job = data?.object || data || {};
    const jobId = job.id || job.job_id;

    if (!jobId) {
      return res.status(400).json({ error: "Missing job id" });
    }

    // =============================
    // 1. EVENT LOGGING (HISTORY)
    // =============================
    await supabase.from("job_events").insert({
      job_id: jobId,
      trigger,
      payload: req.body
    });

    // =============================
    // 2. EVENT ROUTER
    // =============================
    switch (trigger) {

      // -------------------------
      // JOB CREATED
      // -------------------------
      case "Job Created":
        await supabase.from("jobs").upsert(
          {
            job_id: jobId,
            status: job.status || "Scheduled",
            customer_id: job.customer_id || null,
            job_type: job.job_type || null,
            technician_name: job.technician_name || null,
            start_time: job.start_time || null,
            end_time: job.end_time || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            onConflict: "job_id"
          }
        );
        break;

      // -------------------------
      // STATUS UPDATE
      // -------------------------
      case "Job Custom Status Update":
      case "Job Workflow Custom Status Update":
        await supabase
          .from("jobs")
          .upsert(
            {
              job_id: jobId,
              status: job.status || job.new_value || "Unknown",
              updated_at: new Date().toISOString()
            },
            {
              onConflict: "job_id"
            }
          );
        break;

      // -------------------------
      // START TIME UPDATE
      // -------------------------
      case "Job Start Time Update":
        await supabase
          .from("jobs")
          .upsert(
            {
              job_id: jobId,
              start_time: data.new_value,
              updated_at: new Date().toISOString()
            },
            {
              onConflict: "job_id"
            }
          );
        break;

      // -------------------------
      // END TIME UPDATE
      // -------------------------
      case "Job End Time Update":
        await supabase
          .from("jobs")
          .upsert(
            {
              job_id: jobId,
              end_time: data.new_value,
              updated_at: new Date().toISOString()
            },
            {
              onConflict: "job_id"
            }
          );
        break;

      // -------------------------
      // DEFAULT FALLBACK
      // -------------------------
      default:
        await supabase.from("jobs").upsert(
          {
            job_id: jobId,
            status: job.status || "Unknown",
            updated_at: new Date().toISOString()
          },
          {
            onConflict: "job_id"
          }
        );
    }

    return res.status(200).json({
      success: true,
      trigger,
      job_id: jobId
    });

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}
