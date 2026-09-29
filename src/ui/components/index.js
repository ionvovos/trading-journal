// The `ui` object handed to every view through ctx.ui (architecture section 10). All components return DOM nodes.
import { button, iconButton } from './button.js';
import { field } from './field.js';
import { segmented } from './segmented.js';
import { sheet } from './sheet.js';
import { listRow, marketMark } from './listRow.js';
import { figure, tiles, delta, hero, toneOf } from './figure.js';
import { modeBadge, modeSwitch, accountBadge } from './modeBadge.js';
import { stateBanner } from './stateBanner.js';
import { emptyState } from './emptyState.js';
import { progress } from './progress.js';
import { toast, clearToasts } from './toast.js';
import { statusChip } from './statusChip.js';
import { topbar, gearButton } from './topbar.js';
import { tabbar } from './tabbar.js';
import { icon, triangle, logo } from './icons.js';
import { lineChart } from '../charts/lineChart.js';
import { underwaterChart } from '../charts/underwaterChart.js';
import { barList } from '../charts/barList.js';
import { calendarGrid } from '../charts/calendarGrid.js';
import { histogram } from '../charts/histogram.js';
import { el } from '../dom.js';

export const ui = {
  button, iconButton, field, segmented, sheet, listRow, marketMark, figure, tiles, delta, hero, toneOf,
  modeBadge, modeSwitch, accountBadge, stateBanner, emptyState, progress, toast, clearToasts, statusChip,
  topbar, gearButton, tabbar, icon, triangle, logo, el,
  lineChart, underwaterChart, barList, calendarGrid, histogram,
};
