import { Flame, Snowflake, Wind, Droplets, Power, RefreshCw } from 'lucide-react';

// Lucide-ikon per HA hvac_mode (delt mellom kort og utvidet visning)
const MODE_ICONS = { off: Power, heat: Flame, cool: Snowflake, heat_cool: RefreshCw, auto: RefreshCw, dry: Droplets, fan_only: Wind };
export const modeIcon = (mode) => MODE_ICONS[mode] || Flame;
