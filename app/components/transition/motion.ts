export type TransitionMotionPreference = "full" | "reduced";

export const transitionMotionPreferenceFromWindow = (): TransitionMotionPreference => {
  if (typeof window === "undefined") {
    return "full";
  }

  const searchParams = new URLSearchParams(window.location?.search ?? "");
  const motion = searchParams.get("motion") ?? searchParams.get("stageMotion");
  const reducedMotion = searchParams.get("reducedMotion");

  if (
    motion === "off" ||
    motion === "reduced" ||
    motion === "snap" ||
    reducedMotion === "1" ||
    reducedMotion === "true"
  ) {
    return "reduced";
  }

  if (motion === "on" || motion === "full" || reducedMotion === "0") {
    return "full";
  }

  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    ? "reduced"
    : "full";
};
