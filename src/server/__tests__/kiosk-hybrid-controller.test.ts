import { describe, expect, it } from "vitest";

import type { PublicAnnouncementItem } from "~/components/public/AnnouncementsScene";
import {
  createInitialKioskHybridState,
  kioskHybridReducer,
} from "~/components/public/kiosk-hybrid-state";
import { getActiveSceneId } from "~/components/public/slideshow-engine";

const COUNTS = {
  graduatesCount: 10,
  lecturersCount: 4,
  publicationsCount: 6,
  announcementsCount: 7,
  courseSchedulesCount: 10,
};

const SAMPLE_ANNOUNCEMENT: PublicAnnouncementItem = {
  id: "40000000-0000-4000-8000-000000000001",
  title: "Pengumuman Penting Prodi",
  category: "PENGUMUMAN",
  content: "Isi pengumuman lengkap untuk pembaca di layar sentuh kiosk.",
  eventDate: new Date("2026-11-25T00:00:00.000Z"),
  isPublished: true,
  createdAt: new Date("2026-11-20T00:00:00.000Z"),
  updatedAt: new Date("2026-11-20T00:00:00.000Z"),
};

describe("Task 5: Unified Kiosk Hybrid State Machine", () => {
  it("auto-advances only while unpaused, and pauses immediately on touch interaction", () => {
    let state = createInitialKioskHybridState();
    expect(state.isPaused).toBe(false);
    expect(getActiveSceneId(state.slideshow)).toBe("OVERVIEW");

    // Auto tick advances from OVERVIEW -> GRADUATES
    state = kioskHybridReducer(state, { type: "AUTO_TICK", counts: COUNTS });
    expect(getActiveSceneId(state.slideshow)).toBe("GRADUATES");

    // Touch pauses slideshow without changing scene
    state = kioskHybridReducer(state, { type: "TOUCH_INTERACT" });
    expect(state.isPaused).toBe(true);
    expect(getActiveSceneId(state.slideshow)).toBe("GRADUATES");

    // Auto tick while paused is a strict no-op
    const frozen = kioskHybridReducer(state, {
      type: "AUTO_TICK",
      counts: COUNTS,
    });
    expect(frozen).toBe(state);
    expect(getActiveSceneId(frozen.slideshow)).toBe("GRADUATES");
  });

  it("jumps directly to selected scene, resets stale page index when day or room filters change", () => {
    let state = createInitialKioskHybridState();

    state = kioskHybridReducer(state, {
      type: "OPEN_ANNOUNCEMENT_MODAL",
      announcement: SAMPLE_ANNOUNCEMENT,
    });
    expect(state.activeModalAnnouncement?.id).toBe(SAMPLE_ANNOUNCEMENT.id);

    // Jumping to COURSE_SCHEDULE closes modal, pauses, and resets page
    state = kioskHybridReducer(state, {
      type: "SELECT_SCENE",
      sceneId: "COURSE_SCHEDULE",
    });
    expect(state.isPaused).toBe(true);
    expect(state.activeModalAnnouncement).toBeNull();
    expect(state.slideshow.sceneIndex).toBe(6);
    expect(getActiveSceneId(state.slideshow)).toBe("COURSE_SCHEDULE");

    // User advances manually to page 2
    state = kioskHybridReducer(state, {
      type: "SET_SCHEDULE_PAGE",
      pageIndex: 2,
    });
    expect(state.manualSchedulePageIndex).toBe(2);

    // Changing room filter resets manual page index back to 0 (Review Focus #4)
    state = kioskHybridReducer(state, {
      type: "SET_ROOM_FILTER",
      room: "R108",
    });
    expect(state.selectedRoomFilter).toBe("R108");
    expect(state.manualSchedulePageIndex).toBe(0);

    // Advance page again then change day filter -> must also reset to 0
    state = kioskHybridReducer(state, {
      type: "SET_SCHEDULE_PAGE",
      pageIndex: 1,
    });
    state = kioskHybridReducer(state, {
      type: "SET_DAY_FILTER",
      day: "SENIN",
    });
    expect(state.selectedDayFilter).toBe("SENIN");
    expect(state.manualSchedulePageIndex).toBe(0);
  });

  it("handles announcement modal open/close and full 45s idle timeout reset back to Slide 1 OVERVIEW", () => {
    let state = createInitialKioskHybridState();

    state = kioskHybridReducer(state, {
      type: "SELECT_SCENE",
      sceneId: "ANNOUNCEMENTS",
    });
    state = kioskHybridReducer(state, {
      type: "SET_ANNOUNCEMENT_PAGE",
      pageIndex: 1,
    });
    state = kioskHybridReducer(state, {
      type: "SET_DAY_FILTER",
      day: "RABU",
    });
    state = kioskHybridReducer(state, {
      type: "SET_ROOM_FILTER",
      room: "R305",
    });
    state = kioskHybridReducer(state, {
      type: "OPEN_ANNOUNCEMENT_MODAL",
      announcement: SAMPLE_ANNOUNCEMENT,
    });
    expect(state.activeModalAnnouncement).not.toBeNull();

    // Closing modal keeps user in paused mode until idle or explicit resume
    state = kioskHybridReducer(state, { type: "CLOSE_ANNOUNCEMENT_MODAL" });
    expect(state.activeModalAnnouncement).toBeNull();
    expect(state.isPaused).toBe(true);

    // Re-open modal then fire IDLE_TIMEOUT_RESET -> full reset to Slide 1 OVERVIEW
    state = kioskHybridReducer(state, {
      type: "OPEN_ANNOUNCEMENT_MODAL",
      announcement: SAMPLE_ANNOUNCEMENT,
    });
    state = kioskHybridReducer(state, { type: "IDLE_TIMEOUT_RESET" });

    expect(state.isPaused).toBe(false);
    expect(state.selectedDayFilter).toBe("TODAY");
    expect(state.selectedRoomFilter).toBe("ALL");
    expect(state.manualSchedulePageIndex).toBe(0);
    expect(state.manualAnnouncementPageIndex).toBe(0);
    expect(state.activeModalAnnouncement).toBeNull();
    expect(state.slideshow.sceneIndex).toBe(0);
    expect(getActiveSceneId(state.slideshow)).toBe("OVERVIEW");
  });

  it("resumes cleanly on explicit RESUME_SLIDESHOW action", () => {
    let state = createInitialKioskHybridState();
    state = kioskHybridReducer(state, {
      type: "SELECT_SCENE",
      sceneId: "COURSE_SCHEDULE",
    });
    state = kioskHybridReducer(state, {
      type: "SET_ROOM_FILTER",
      room: "R109",
    });

    state = kioskHybridReducer(state, { type: "RESUME_SLIDESHOW" });
    expect(state.isPaused).toBe(false);
    expect(state.selectedDayFilter).toBe("TODAY");
    expect(state.selectedRoomFilter).toBe("ALL");
    expect(state.activeModalAnnouncement).toBeNull();
  });
});
