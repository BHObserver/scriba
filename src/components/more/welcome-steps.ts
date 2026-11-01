export const WELCOME_STEPS = ["welcome", "how", "shop", "cash"] as const;
export type WelcomeStep = (typeof WELCOME_STEPS)[number];

/** `?step=` as a welcome step; anything else starts at the beginning. */
export function welcomeStep(param: string | string[] | undefined): WelcomeStep {
  return WELCOME_STEPS.find((s) => s === param) ?? "welcome";
}
