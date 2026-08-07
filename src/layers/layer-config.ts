export interface LayerOptions {
  /** Enable layer validation (default: false — opt-in) */
  enabled?: boolean;
  /** Throw on violation instead of warning (default: false) */
  strict?: boolean;
  /** Custom rules for exceptions and extended layers */
  customRules?: {
    /** Allow specific cross-layer imports that would otherwise violate */
    allow?: Array<{ from: string; to: string }>;
    /** Define custom layers beyond the 4 defaults (name → numeric level) */
    layers?: Record<string, number>;
  };
}
