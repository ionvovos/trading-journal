// A chart called without a formatter uses the active language and the device time zone, so `barList({ rows })` works as the
// architecture contract states. Views normally pass ctx.fmt.
import { createFormat } from '../../i18n/format.js';
import { getLang } from '../../i18n/i18n.js';

export const defaultFmt = () => createFormat({ lang: getLang(), tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })() });
