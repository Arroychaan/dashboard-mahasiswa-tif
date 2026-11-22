import type { PublicAnnouncementItem } from "./AnnouncementsScene";
import type { PublicDayFilter } from "./course-schedule-utils";
import type { PublicSceneId } from "./design-tokens";
import {
  advanceSlideshowState,
  createInitialSlideshowState,
  jumpToScene,
  resetToAttractState,
  type SlideshowDatasetCounts,
  type SlideshowState,
} from "./slideshow-engine";

export interface KioskHybridState {
  slideshow: SlideshowState;
  isPaused: boolean;
  selectedDayFilter: PublicDayFilter;
  selectedRoomFilter: string;
  manualSchedulePageIndex: number;
  manualAnnouncementPageIndex: number;
  activeModalAnnouncement: PublicAnnouncementItem | null;
}

export type KioskHybridAction =
  | { type: "AUTO_TICK"; counts: SlideshowDatasetCounts }
  | { type: "TOUCH_INTERACT" }
  | { type: "SELECT_SCENE"; sceneId: PublicSceneId }
  | { type: "SET_DAY_FILTER"; day: PublicDayFilter }
  | { type: "SET_ROOM_FILTER"; room: string }
  | { type: "SET_SCHEDULE_PAGE"; pageIndex: number }
  | { type: "SET_ANNOUNCEMENT_PAGE"; pageIndex: number }
  | { type: "OPEN_ANNOUNCEMENT_MODAL"; announcement: PublicAnnouncementItem }
  | { type: "CLOSE_ANNOUNCEMENT_MODAL" }
  | { type: "IDLE_TIMEOUT_RESET" }
  | { type: "RESUME_SLIDESHOW" };

export function createInitialKioskHybridState(): KioskHybridState {
  return {
    slideshow: createInitialSlideshowState(),
    isPaused: false,
    selectedDayFilter: "TODAY",
    selectedRoomFilter: "ALL",
    manualSchedulePageIndex: 0,
    manualAnnouncementPageIndex: 0,
    activeModalAnnouncement: null,
  };
}

export function kioskHybridReducer(
  state: KioskHybridState,
  action: KioskHybridAction,
): KioskHybridState {
  switch (action.type) {
    case "AUTO_TICK": {
      if (state.isPaused) {
        return state;
      }
      return {
        ...state,
        slideshow: advanceSlideshowState(state.slideshow, action.counts),
      };
    }

    case "TOUCH_INTERACT": {
      if (state.isPaused) {
        return state;
      }
      return {
        ...state,
        isPaused: true,
        manualSchedulePageIndex: state.slideshow.courseSchedulePageIndex,
        manualAnnouncementPageIndex: state.slideshow.announcementPageIndex,
      };
    }

    case "SELECT_SCENE": {
      return {
        ...state,
        isPaused: true,
        activeModalAnnouncement: null,
        manualSchedulePageIndex: 0,
        manualAnnouncementPageIndex: 0,
        slideshow: jumpToScene(state.slideshow, action.sceneId),
      };
    }

    case "SET_DAY_FILTER": {
      return {
        ...state,
        isPaused: true,
        selectedDayFilter: action.day,
        manualSchedulePageIndex: 0,
      };
    }

    case "SET_ROOM_FILTER": {
      return {
        ...state,
        isPaused: true,
        selectedRoomFilter: action.room,
        manualSchedulePageIndex: 0,
      };
    }

    case "SET_SCHEDULE_PAGE": {
      return {
        ...state,
        isPaused: true,
        manualSchedulePageIndex: Math.max(0, Math.floor(action.pageIndex)),
      };
    }

    case "SET_ANNOUNCEMENT_PAGE": {
      return {
        ...state,
        isPaused: true,
        manualAnnouncementPageIndex: Math.max(0, Math.floor(action.pageIndex)),
      };
    }

    case "OPEN_ANNOUNCEMENT_MODAL": {
      return {
        ...state,
        isPaused: true,
        activeModalAnnouncement: action.announcement,
      };
    }

    case "CLOSE_ANNOUNCEMENT_MODAL": {
      if (state.activeModalAnnouncement === null) {
        return state;
      }
      return {
        ...state,
        activeModalAnnouncement: null,
      };
    }

    case "IDLE_TIMEOUT_RESET": {
      return {
        ...state,
        isPaused: false,
        selectedDayFilter: "TODAY",
        selectedRoomFilter: "ALL",
        manualSchedulePageIndex: 0,
        manualAnnouncementPageIndex: 0,
        activeModalAnnouncement: null,
        slideshow: resetToAttractState(state.slideshow),
      };
    }

    case "RESUME_SLIDESHOW": {
      return {
        ...state,
        isPaused: false,
        selectedDayFilter: "TODAY",
        selectedRoomFilter: "ALL",
        manualSchedulePageIndex: 0,
        manualAnnouncementPageIndex: 0,
        activeModalAnnouncement: null,
      };
    }
  }
}
