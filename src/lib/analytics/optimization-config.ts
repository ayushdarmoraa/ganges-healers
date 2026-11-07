/**
 * Optimization Loop Configuration
 *
 * Controls all thresholds, cooldowns, and limits for the auto-optimization system.
 * Change values here — never hardcode in logic files.
 */
export const optimizationConfig = {
  /** Safety gates — minimum data before any action is taken */
  gates: {
    /** Minimum quiz_start sessions before running analysis */
    minSessions: 200,
    /** Minimum dropped sessions before a drop-off is actionable */
    minDropSessions: 100,
    /** Maximum active experiments at any time */
    maxActiveExperiments: 3,
    /** Hours to wait after creating an experiment before creating another for the same stage */
    cooldownHours: 120,
  },

  /** Experiment lifecycle thresholds */
  experiments: {
    /** Minimum impressions per variant before evaluating winner */
    minImpressions: 100,
    /** Minimum conversion lift (fraction) to declare a winner (0.15 = 15%) */
    minLift: 0.15,
    /** Minimum days an experiment must run before winner evaluation */
    minDaysActive: 3,
    /** Days of data to analyze for the funnel (default window) */
    analysisDays: 7,
    /** Maximum days allowed for analysis window */
    maxAnalysisDays: 30,
    /** Auto-complete experiments older than this many days regardless */
    maxDurationDays: 30,
  },

  /** Bundle optimization thresholds */
  bundle: {
    /** Minimum bundle show rate before suggesting increase */
    minShowRate: 0.3,
    /** Discount step increment when bundle underperforms (fraction) */
    discountStep: 0.05,
  },

  /** Drop-off thresholds that trigger suggestions/experiments */
  dropOff: {
    /** Drop rate % that triggers a suggestion */
    suggestionThreshold: 40,
    /** Drop rate % that triggers auto-experiment creation */
    experimentThreshold: 50,
  },

  /** Loop safety limits */
  loop: {
    /** Maximum experiments created in a single optimization loop run */
    maxActionsPerRun: 2,
    /** Minimum revenue impact score (rupees) before auto-creating an experiment */
    minImpactScore: 500,
  },

  /** Data retention */
  retention: {
    /** Days to keep raw funnel events before cleanup */
    eventRetentionDays: 90,
  },
} as const

export type OptimizationConfig = typeof optimizationConfig
