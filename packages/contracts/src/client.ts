/**
 * The browser's entry: the rules and constants the web app runs, without zod. The schemas stay
 * on the server, where requests are validated; the web app imports their types only, and types
 * cost nothing in the bundle.
 */
export { CLIENT_HEADER, SESSION_COOKIE } from './constants.js';
export { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from './passwords.js';
export {
  ACTIONS,
  can,
  isStaffRole,
  PARTNER_ROLES,
  STAFF_ROLES,
  type Action,
  type PartnerRole,
  type Role,
  type StaffRole,
} from './permissions.js';
