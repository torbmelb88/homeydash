import React from 'react';
import { Battery, BatteryLow, BatteryMedium, BatteryFull, BatteryCharging } from 'lucide-react';

const BatteryIcon = ({ percentage, isCharging = false, size = 16, className = '' }) => {
    if (isCharging) {
        return <BatteryCharging size={size} className={className} />;
    }

    if (percentage === undefined || percentage === null) {
        return <Battery size={size} className={className} />;
    }

    // Lucide icons:
    // Battery: Empty outline
    // BatteryLow: ~25%
    // BatteryMedium: ~50%
    // BatteryFull: 100%

    if (percentage <= 10) {
        return <Battery size={size} className={className} color="var(--color-error)" />;
    } else if (percentage <= 30) {
        return <BatteryLow size={size} className={className} color="var(--color-warning)" />;
    } else if (percentage <= 70) {
        return <BatteryMedium size={size} className={className} />;
    } else {
        return <BatteryFull size={size} className={className} color="var(--color-success)" />;
    }
};

export default BatteryIcon;
