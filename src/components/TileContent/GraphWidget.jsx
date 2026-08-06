import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useHomey } from '../../context/HomeyContext';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { Loader, Menu } from 'lucide-react';

const GraphWidget = ({ tile }) => {
    const { api, isAuthenticated } = useHomey();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [allLogs, setAllLogs] = useState([]);
    const chartContainerRef = useRef(null);

    // Settings – stabilisert med useMemo for å unngå unødvendige re-fetches
    const selectedLogs = useMemo(() => tile.settings?.logs || [], [JSON.stringify(tile.settings?.logs)]); // eslint-disable-line
    const defaultTimeRange = tile.settings?.range || 'last24Hours';
    const [localTimeRange, setLocalTimeRange] = useState(defaultTimeRange);


    useEffect(() => {
        if (!selectedLogs || selectedLogs.length === 0) {
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                // 1. Fetch available logs to resolve URI/ID
                // We do this every time or could cache it, but it's safer to ensure we have latest metadata.
                const fetchedLogs = await api.getInsightLogs();
                setAllLogs(fetchedLogs);

                // Determine start/end times based on range
                const now = new Date();
                let start = new Date();
                let resolution = 'last24Hours';

                // Calculate start time and set resolution
                switch (localTimeRange) {
                    case 'lastHour':
                        start.setHours(now.getHours() - 1);
                        resolution = 'lastHour';
                        break;
                    case 'last6Hours':
                        start.setHours(now.getHours() - 6);
                        resolution = 'last6Hours';
                        break;

                    case 'last24Hours':
                        start.setHours(now.getHours() - 24);
                        resolution = 'last24Hours';
                        break;
                    case 'last7Days':
                        start.setDate(now.getDate() - 7);
                        resolution = 'last7Days';
                        break;
                    case 'last14Days':
                        start.setDate(now.getDate() - 14);
                        resolution = 'last14Days';
                        break;
                    case 'last31Days':
                        start.setDate(now.getDate() - 31);
                        resolution = 'last31Days';
                        break;
                    default:
                        start.setHours(now.getHours() - 24);
                        resolution = 'last24Hours';
                }

                // 2. Fetch data for all selected logs
                const promises = selectedLogs.map(logId => {
                    // Find the log object
                    const logObj = fetchedLogs.find(l => l.id === logId);

                    // Default values
                    let uri = 'homey';
                    let id = logId;

                    if (logObj) {
                        if (logObj.uri) uri = logObj.uri;
                        if (logObj.id) id = logObj.id;
                    }

                    // Fallback: If uri is 'homey' (default) but logId looks like a composite key (contains colons), try to split it.
                    if (uri === 'homey' && logId && typeof logId === 'string' && logId.includes(':')) {
                        const parts = logId.split(':');
                        if (parts.length >= 2) {
                            parts.pop(); // Remove the capability measure part to get the URI
                            uri = parts.join(':'); // e.g. homey:device:UUID
                            id = logId; // The API expects the FULL logId as the ID parameter
                        }
                    }

                    if (!uri) uri = 'homey';

                    return api.getInsightLogEntries(uri, id, start, now, resolution)
                        .then(entries => ({ logId, entries }))
                        .catch(err => {
                            console.warn(`Failed to fetch data for ${logId}`, err);
                            return null; // Return null effectively calls filter(Boolean) later
                        });
                });

                const results = await Promise.all(promises);
                const validResults = results.filter(r => r !== null);

                // Merge data
                // Need to align timestamps. Insights returns { t: date, v: value }
                // We'll map entries to a common format.
                const dataMap = new Map();

                validResults.forEach(({ logId, entries }) => {
                    // Check if entries is an object containing 'values'
                    const actualEntries = Array.isArray(entries) ? entries : (entries?.values || []);
                    if (!actualEntries || !actualEntries.length) return;

                    actualEntries.forEach(entry => {
                        // Homey API may use t/v or x/y or datetime/value
                        const tVal = entry.t !== undefined ? entry.t : (entry.x !== undefined ? entry.x : entry.datetime);
                        const vVal = entry.v !== undefined ? entry.v : (entry.y !== undefined ? entry.y : entry.value);

                        if (tVal === undefined || vVal === undefined) return;

                        const time = new Date(tVal).getTime();
                        if (!dataMap.has(time)) {
                            dataMap.set(time, { time });
                        }
                        const point = dataMap.get(time);
                        point[logId] = vVal;
                    });
                });

                const mergedData = Array.from(dataMap.values()).sort((a, b) => a.time - b.time);
                setData(mergedData);
            } catch (err) {
                console.error("Graph fetch error full:", err);
                const msg = err.message || "Ukjent feil";
                setError(`Kunne ikke hente data: ${msg}`);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 60 * 1000);
        return () => clearInterval(interval);

    }, [localTimeRange, selectedLogs, isAuthenticated]); // eslint-disable-line

    // Memoize log labels so they don't recalculate on every render
    const logLabels = useMemo(() => {
        const map = {};
        selectedLogs.forEach(logId => {
            const logObj = allLogs.find(l => l.id === logId);
            const defaultLabel = api.formatLogLabel
                ? api.formatLogLabel(logObj || { id: logId })
                : (logObj?.name || logId);
            map[logId] = tile.settings?.customNames?.[logId] || defaultLabel;
        });
        return map;
    }, [allLogs, selectedLogs, tile.settings?.customNames]); // eslint-disable-line

    // Calculate min/max indices for each log to draw dots
    const minMaxIndices = useMemo(() => {
        if (!data || data.length === 0) return {};
        const indices = {};
        selectedLogs.forEach(logId => {
            let minVal = Infinity;
            let maxVal = -Infinity;
            let minIdx = -1;
            let maxIdx = -1;
            data.forEach((d, i) => {
                if (d[logId] !== undefined && d[logId] !== null) {
                    if (d[logId] < minVal) {
                        minVal = d[logId];
                        minIdx = i;
                    }
                    if (d[logId] > maxVal) {
                        maxVal = d[logId];
                        maxIdx = i;
                    }
                }
            });
            indices[logId] = { min: minIdx, max: maxIdx };
        });
        return indices;
    }, [data, selectedLogs]);

    const formatXAxis = (tickItem) => {
        const date = new Date(tickItem);
        if (localTimeRange === 'lastHour' || localTimeRange === 'last6Hours' || localTimeRange === 'last24Hours') {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    };

    // Generate colors for lines
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    const renderCustomDot = useCallback((props) => {
        const { cx, cy, index, dataKey, stroke, value } = props;
        const limits = minMaxIndices[dataKey];
        if (limits && (index === limits.min || index === limits.max)) {
            const isMin = index === limits.min;
            const displayValue = value > 100 ? Math.round(value) : Number(value).toFixed(1);

            // Adjust horizontal anchor so we don't bleed out of the left/right edges
            let anchor = "middle";
            let xOff = 0;
            if (index === 0) {
                anchor = "start";
                xOff = 6;
            } else if (index === data.length - 1) {
                anchor = "end";
                xOff = -6;
            }

            // Invert the vertical offset so we draw the text /inside/ the graph. 
            // Min value is at the bottom (large CY), Max is at top (small CY).
            const yPos = isMin ? cy - 12 : cy + 18;

            return (
                <g key={`${dataKey}-${index}`}>
                    <circle cx={cx} cy={cy} r={4} stroke="var(--color-bg-primary)" strokeWidth={1.5} fill={stroke} />
                    {/* Outline for readability over lines/grids */}
                    <text
                        x={cx + xOff}
                        y={yPos}
                        fill="var(--color-bg-primary)"
                        fontSize={11}
                        fontWeight={700}
                        textAnchor={anchor}
                        stroke="var(--color-bg-primary)"
                        strokeWidth={4}
                        strokeLinejoin="round"
                    >
                        {displayValue}
                    </text>
                    {/* Actual Text */}
                    <text
                        x={cx + xOff}
                        y={yPos}
                        fill={stroke}
                        fontSize={11}
                        fontWeight={700}
                        textAnchor={anchor}
                    >
                        {displayValue}
                    </text>
                </g>
            );
        }
        return null;
    }, [data, minMaxIndices]);

    if (!selectedLogs.length) {
        return (
            <div className="tile-content" style={{ justifyContent: 'center', textAlign: 'center', padding: '10px' }}>
                <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>Velg datakilder i innstillinger</p>
            </div>
        );
    }

    if (loading && data.length === 0) {
        return (
            <div className="tile-content" style={{ justifyContent: 'center' }}>
                <Loader className="animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="tile-content" style={{ justifyContent: 'center' }}>
                <p style={{ color: 'var(--color-error)' }}>{error}</p>
            </div>
        );
    }

    return (
        <div className="tile-content" style={{ padding: '0px', width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {/* Widget Title */}
            {tile.name && (
                <div style={{
                    padding: '8px 10px 0px 10px',
                    fontWeight: '500',
                    fontSize: '0.9rem',
                    zIndex: 10
                }}>
                    {tile.name}
                </div>
            )}

            {/* Menu and Legend Row */}
            <div style={{
                padding: tile.name ? '4px 10px' : '8px 10px 4px 10px',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                alignItems: 'center',
                zIndex: 10
            }}>
                {/* Discreet Time Range Selector */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Menu size={16} color="var(--color-text-secondary)" style={{ cursor: 'pointer' }} />
                    <select
                        value={localTimeRange}
                        onChange={(e) => setLocalTimeRange(e.target.value)}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            opacity: 0,
                            cursor: 'pointer',
                            WebkitAppearance: 'none',
                            MozAppearance: 'none',
                            appearance: 'none',
                        }}
                        onPointerDown={(e) => e.stopPropagation()} // Prevent dragging the tile while selecting
                    >
                        {[
                            { value: 'lastHour', label: 'Siste time' },
                            { value: 'last6Hours', label: 'Siste 6 timer' },
                            { value: 'last24Hours', label: 'Siste 24 timer' },
                            { value: 'last7Days', label: 'Siste 7 dager' },
                            { value: 'last14Days', label: 'Siste 14 dager' },
                            { value: 'last31Days', label: 'Siste måned' },
                        ].map(opt => (
                            <option
                                key={opt.value}
                                value={opt.value}
                                style={{
                                    background: 'var(--color-bg-secondary, #1e1e24)',
                                    color: 'var(--color-text-primary, #ffffff)'
                                }}
                            >
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Simple Legend Items */}
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    flexWrap: 'wrap',
                    alignItems: 'center'
                }}>
                    {selectedLogs.map((logId, index) => (
                        <div key={logId} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: colors[index % colors.length] }}></div>
                            <span style={{ fontSize: '10px', opacity: 0.7 }}>{logLabels[logId] || logId}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div ref={chartContainerRef} style={{ flex: 1, width: '100%', minHeight: 0, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                        <XAxis
                            dataKey="time"
                            tickFormatter={formatXAxis}
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }}
                            minTickGap={30}
                        />
                        <YAxis
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }}
                            width={40}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'var(--color-bg-tertiary)', border: 'none', borderRadius: '8px' }}
                            labelFormatter={label => new Date(label).toLocaleString()}
                        />
                        {selectedLogs.map((logId, index) => (
                            <Line
                                key={logId}
                                type="monotone"
                                dataKey={logId}
                                name={logLabels[logId] || logId}
                                stroke={colors[index % colors.length]}
                                strokeWidth={2}
                                dot={renderCustomDot}
                                activeDot={{ r: 4 }}
                                isAnimationActive={false}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default GraphWidget;
