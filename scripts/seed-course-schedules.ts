import { db } from "~/server/db";
import { seedDummyCourseSchedules } from "~/server/db/seed-course-schedules";

async function main() {
  try {
    const result = await seedDummyCourseSchedules(db);
    if (result.skipped) {
      console.info(
        "Seed dilewati: Tabel course_schedules sudah memiliki data.",
      );
    } else {
      console.info(
        `Seed berhasil: ${result.insertedCount} jadwal mata kuliah dummy telah ditambahkan.`,
      );
    }
    process.exit(0);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Kesalahan tidak diketahui";
    console.error(`Seed gagal: ${message}`);
    process.exit(1);
  }
}

void main();
