import { describe, expect, it } from "vitest";
import {
  announcementCategorySchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
  updateFeedbackQrSchema,
} from "~/lib/validators";

describe("Announcements & Feedback QR Schema & Validation", () => {
  it("validates announcementCategorySchema correctly", () => {
    expect(announcementCategorySchema.parse("PENGUMUMAN")).toBe("PENGUMUMAN");
    expect(announcementCategorySchema.parse("BERITA_ACARA")).toBe("BERITA_ACARA");
    expect(() => announcementCategorySchema.parse("INVALID")).toThrow();
  });

  it("validates createAnnouncementSchema requirements", () => {
    const validData = {
      title: "Kuliah Umum Kecerdasan Buatan",
      category: "PENGUMUMAN",
      content: "Kuliah umum bersama praktisi industri teknologi.",
      eventDate: "2026-12-01T09:00:00.000Z",
      isPublished: false,
    };
    const parsed = createAnnouncementSchema.parse(validData);
    expect(parsed.title).toBe("Kuliah Umum Kecerdasan Buatan");
    expect(parsed.category).toBe("PENGUMUMAN");
    expect(parsed.isPublished).toBe(false);

    // Empty title should fail
    expect(() =>
      createAnnouncementSchema.parse({
        ...validData,
        title: "   ",
      }),
    ).toThrow();

    // Missing eventDate should fail
    expect(() =>
      createAnnouncementSchema.parse({
        ...validData,
        eventDate: "invalid-date",
      }),
    ).toThrow();
  });

  it("validates updateAnnouncementSchema requirements", () => {
    const updateData = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      title: "Update Berita Acara Yudisium",
      category: "BERITA_ACARA",
      content: "Berita acara pelaksanaan yudisium periode genap.",
      eventDate: new Date("2026-11-20T08:00:00.000Z"),
    };
    const parsed = updateAnnouncementSchema.parse(updateData);
    expect(parsed.id).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(parsed.category).toBe("BERITA_ACARA");
  });

  it("validates updateFeedbackQrSchema requirements", () => {
    const validQr = {
      qrPath: "/uploads/qr/feedback-qr-123.webp",
      title: "Kotak Saran & Sumbangan",
      description: "Pindai kode QR untuk memberikan saran atau sumbangan.",
    };
    const parsed = updateFeedbackQrSchema.parse(validQr);
    expect(parsed.qrPath).toBe("/uploads/qr/feedback-qr-123.webp");

    // Invalid qrPath path traversal attempt
    expect(() =>
      updateFeedbackQrSchema.parse({
        ...validQr,
        qrPath: "../../../etc/passwd",
      }),
    ).toThrow();
  });
});
