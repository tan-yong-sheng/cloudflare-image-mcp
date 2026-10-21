import { AGNES_LOGO_DATA_URI } from "../../config/brand";

/**
 * Cloudflare ships a brand mark in Font Awesome. Agnes ships an app
 * icon, inlined as a data URI so the mark adds no new third-party
 * origin: the workbench is the credential surface, and a vendor-hosted
 * request there would disclose the operator's visit.
 *
 * Both marks are decorative - the family name is always rendered as
 * text beside them - so they carry no accessible name.
 */
const FAMILY_ICONS: Record<string, string> = {
  cloudflare: "fa-brands fa-cloudflare",
};

const FAMILY_LOGOS: Record<string, string> = {
  agnes: AGNES_LOGO_DATA_URI,
};

export function FamilyMark({ providerId }: { providerId: string }) {
  // Own-property lookups: a provider id such as "constructor" would
  // otherwise resolve through Object.prototype and take the logo branch
  // with a function value.
  const logo = Object.hasOwn(FAMILY_LOGOS, providerId)
    ? FAMILY_LOGOS[providerId]
    : null;
  if (logo) {
    return (
      <img src={logo} alt="" className="family-mark mr-2" aria-hidden="true" />
    );
  }
  if (!Object.hasOwn(FAMILY_ICONS, providerId)) return null;
  return (
    <i className={FAMILY_ICONS[providerId] + " mr-2"} aria-hidden="true" />
  );
}
