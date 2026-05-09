import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { trigger, data } = req.body || {};

    // Normalize FieldPulse payload shape
    const job = data?.object || data || {};
    const jobId = job.id || job.job_id;

    if (!jobId) {
      return res.status(400).json({
        error: "Missing job id in payload"
      });
    }

    // =========================
    // EVENT ROUTER
    // =========================
    switch (trigger) {

      // -------------------------
      // JOB CREATED (full insert)
      // -------------------------
      case "Job Created": {
        const { error } = await supabase.from("jobs").upsert({
          job_id: jobId,
          status: job.status || "Scheduled",
          customer_id: job.customer_id || null,
          job_type: job.job_type || null,
          technician_name: job.technician_name || null,
          start_time: job.start_time || null,
          end_time: job.end_time || null,
          updated_at: new Date().toISOString()
        });

        if (error) throw error;
        break;
      }

      // -------------------------
      // STATUS CHANGE ONLY
      // -------------------------
      case "Job Custom Status Update":
      case "Job Workflow Custom Status Update": {
        const { error } = await supabase
          .from("jobs")
          .update({
            status: job.status || job.new_value || "Unknown",
            updated_at: new Date().toISOString()
          })
          .eq("job_id", jobId);

        if (error) throw error;
        break;
      }

      // -------------------------
      // SCHEDULE START UPDATE
      // -------------------------
      case "Job Start Time Update": {
        const { error } = await supabase
          .from("jobs")
          .update({
            start_time: data?.new_value || null,
            updated_at: new Date().toISOString()
          })
          .eq("job_id", jobId);

        if (error) throw error;
        break;
      }

      // -------------------------
      // SCHEDULE END UPDATE
      // -------------------------
      case "Job End Time Update": {
        const { error } = await supabase
          .from("jobs")
          .update({
            end_time: data?.new_value || null,
            updated_at: new Date().toISOString()
          })
          .eq("job_id", jobId);

        if (error) throw error;
        break;
      }

      // -------------------------
      // DEFAULT (unknown events)
      // -------------------------
      default: {
        console.log("Unhandled trigger:", trigger);

        // Still store minimal fallback update
        await supabase.from("jobs").upsert({
          job_id: jobId,
          status: job.status || "Unknown",
          updated_at: new Date().toISOString()
        });
      }
    }

    return res.status(200).json({
      success: true,
      trigger: trigger || "unknown",
      job_id: jobId
    });

  } catch (err) {
    console.error("Webhook error:", err);

    return res.status(500).json({
      error: err.message
    });
  }
}
