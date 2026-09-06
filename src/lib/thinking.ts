/* ============================================================================
 * thinking.ts — can this particular model think?
 *
 * The Think switch in the composer is the first control in the app whose
 * availability depends on the *model*, not the backend. Every other capability
 * is a property of where the request goes: OpenRouter can search the web and
 * Ollama cannot, and that never changes while you are typing. Reasoning is not
 * like that. The same OpenRouter key reaches models that reason and models
 * that do not, and switching between them is one click in the chip next door.
 *
 * So the answer has to be looked up, and it has to be looked up per model. The
 * lookup is OpenRouter's `supported_parameters`, which services/pricing.ts
 * already has in hand — the catalogue fetch that prices a model also says
 * whether it takes a `reasoning` parameter. No table lives in this repo, for
 * the same reason no price table does: it would rot within a month.
 *
 * Three answers, not two, and the third is the important one:
 *
 *   yes      the catalogue says it takes the parameter. Switch is live.
 *   no       the catalogue says it does not. Switch is dead, and says why.
 *   unknown  the catalogue has never heard of this id, or has not loaded yet.
 *
 * `unknown` stays *clickable*. Refusing on ignorance is the same failure as
 * the dead dial, only inverted: a local model the catalogue cannot see would
 * be permanently locked out of a feature it may well support. The tooltip says
 * we are guessing, and the request goes out; a backend that dislikes the
 * parameter says so, which is a better teacher than a grey button.
 *
 * Only a catalogue hit can produce `no`. Nothing here ever infers "cannot
 * think" from a model's name.
 * ========================================================================== */
import { catalogueEntry } from "@/services/pricing";

export type ThinkingVerdict = "yes" | "no" | "unknown";

export interface ThinkingSupport {
  verdict: ThinkingVerdict;
  /** Whether the composer should let you press it. */
  usable: boolean;
  /** One sentence, written to be read in a tooltip on a disabled button. */
  why: string;
}

/** The short name a tooltip should call a model — the vendor prefix is noise
 *  in a sentence about one model. */
function shortName(model: string): string {
  return model.split("/").pop() || model;
}

/**
 * The decision, given an answer that has already been looked up.
 *
 * Split from the lookup so the table above can be tested without a catalogue,
 * a network or a localStorage — and because the two really are separate
 * questions. Where the fact comes from is pricing.ts's business; what a
 * missing fact *means* is the part with an opinion in it.
 *
 * `reasoning` is undefined when nothing is known, which is not the same as
 * false and must never collapse into it: a record cached before the field
 * existed has it missing, and reading that as "cannot think" would grey out
 * every model in the app for a day.
 */
export function verdictFor(model: string, reasoning: boolean | undefined): ThinkingSupport {
  if (!model) return { verdict: "unknown", usable: false, why: "Pick a model first." };

  if (reasoning === true) {
    return {
      verdict: "yes",
      usable: true,
      why: "Reasons step by step before answering. Slower, and the thinking is billed as output tokens."
    };
  }
  if (reasoning === false) {
    return {
      verdict: "no",
      usable: false,
      why: `${shortName(model)} does not support thinking. Pick a reasoning model to use this.`
    };
  }

  return {
    verdict: "unknown",
    usable: true,
    why: `Not sure whether ${shortName(model)} can think — it is not in the model catalogue. The switch is sent anyway, and the backend will say if it disagrees.`
  };
}

export function thinkingSupport(model: string): ThinkingSupport {
  return verdictFor(model, catalogueEntry(model)?.reasoning);
}
