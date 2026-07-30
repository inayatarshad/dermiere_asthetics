/**
 * /faq - the owner's short address for the Brand Discovery admin.
 * (He thinks of the portal as "the FAQ form"; the dashboard lives at
 * /discovery, this just gets him there. Admin gate is on the target.)
 */

import { redirect } from "next/navigation";

export default function FaqRedirect() {
  redirect("/discovery");
}
