/**
 * Shared mutable app state (Phase 1 module split).
 */
export const state = {
  currentStatus: null,
  currentSchedule: {},
  isOwner: false,
  /** Firebase role: owner | coach | member */
  role: "member",
  activeTab: "home",
  weekOffset: 0,
  selectedDayDetail: null,
  trainingUser: localStorage.getItem("kg_user") || "",
  pendingWorkoutStart: false,
  checkedInAs: "",
  growthMvpInitialized: false,
  selectedBody: new Set(),
  selectedLevel: null,
  selectedDuration: 30,
  currentWorkoutQueue: [],
  currentExerciseIdx: 0,
  completedBodies: new Set(),
  currentSets: [],
  customExercises: {},
  manualSelectedExerciseIds: new Set(),
  authUid: null,
  authPermanent: false
};

export function setTrainingUser(name) {
  state.trainingUser = String(name || "").trim();
  localStorage.setItem("kg_user", state.trainingUser);
}

export function getTrainingUser() {
  return state.trainingUser;
}
