import { runDoctor, formatDoctorReport } from "./doctor";

export async function runVerify(rootDir: string, json: boolean): Promise<number> {
  const doctorReport = await runDoctor(rootDir, { quality: true, enforceAuditTrail: true });
  if (!doctorReport.ok) {
    if (json) {
      console.log(JSON.stringify({ ok: false, step: "doctor", report: doctorReport }));
    } else {
      console.error(formatDoctorReport(doctorReport));
      console.error("\n❌ Pre-commit quality & audit verification failed.");
    }
    return 1;
  }

  if (json) {
    console.log(JSON.stringify({ ok: true, report: doctorReport }));
  } else {
    console.log(formatDoctorReport(doctorReport));
    console.log("\n✅ Pre-commit verification passed! Safe to commit.");
  }
  return 0;
}
