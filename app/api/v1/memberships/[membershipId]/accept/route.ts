import { handler, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/context";
import { acceptInvite } from "@/lib/services/members";

/** The invited user accepts their business invitation. */
export const POST = handler(async (req, ctx) => {
  const { user } = await requireUser(req);
  const { membershipId } = await ctx.params;
  const membership = await acceptInvite(user.id, membershipId);
  return ok(membership, "Invitation accepted");
});
