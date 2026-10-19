/**
 * The provider brand marks.
 *
 * The Worker and the client show the same marks in their workbench, so
 * there is one source of truth: the Worker's brand module. It is a
 * self-contained module (a data URI and no imports), so importing it
 * across the package boundary costs nothing at build time and keeps the
 * two surfaces from drifting apart.
 */
export { AGNES_LOGO_DATA_URI } from "../../../workers/src/config/brand";
