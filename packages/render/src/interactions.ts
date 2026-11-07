import type { Interaction, InteractionTrigger } from "@webfm/model";

/**
 * First interaction for a trigger. Framer plays one effect per trigger, so a
 * node with several effects of the same kind only uses the earliest one.
 */
export function firstInteraction(
  interactions: readonly Interaction[] | undefined,
  trigger: InteractionTrigger,
): Interaction | undefined {
  return interactions?.find((interaction) => interaction.trigger === trigger);
}
