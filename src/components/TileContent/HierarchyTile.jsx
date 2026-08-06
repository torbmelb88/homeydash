import React, { useState, useMemo } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { ChevronRight, ArrowLeft, Zap, Activity, Home, Box, Layers, Sun, Snowflake, Droplet, Wind, Coins, Banknote, Gauge } from 'lucide-react';

const IconMap = {
    'Home': Home,
    'Zap': Zap,
    'Activity': Activity,
    'Box': Box,
    'Layers': Layers,
    'Sun': Sun,
    'Snowflake': Snowflake,
    'Droplet': Droplet,
    'Wind': Wind,
    'Coins': Coins,
    'Banknote': Banknote,
    'Gauge': Gauge
};

const getIcon = (iconName, size = 20, theme = 'default') => {
    let finalIconName = iconName;
    if (!finalIconName || finalIconName === 'default') {
        if (theme === 'money') finalIconName = 'Coins';
        else if (theme === 'power') finalIconName = 'Zap';
        else finalIconName = 'Zap';
    }
    const IconCmp = IconMap[finalIconName] || IconMap[iconName] || Zap;
    return <IconCmp size={size} />;
};

const HierarchyTile = ({ tile, expanded, onCloseExpanded }) => {
    const { devices = [] } = useHomey();
    const [path, setPath] = useState([]);

    const settings = tile.settings || {};
    const unit = settings.unit || 'W';
    const theme = settings.theme || 'default';
    const decimals = settings.decimals ?? 0;
    const autoPrefix = settings.autoPrefix || false;
    const showPercentage = settings.showPercentage || false;
    const sortByValue = settings.sortByValue || false;
    const hideZero = settings.hideZero || false;

    // Helper: Resolve the current node based on path
    const getNode = (root, pathIndices) => {
        let current = root;
        for (const index of pathIndices) {
            if (current.children && current.children[index]) {
                current = current.children[index];
            } else {
                return null;
            }
        }
        return current;
    };

    // Helper: Recursive value calculation
    const calculateNodeValue = (node) => {
        if (!node) return 0;
        if (node.deviceId && node.capability) {
            const device = devices.find(d => d.id === node.deviceId);
            if (device && device.capabilitiesObj && device.capabilitiesObj[node.capability]) {
                return device.capabilitiesObj[node.capability].value || 0;
            }
        }
        if (node.children && node.children.length > 0) {
            return node.children.reduce((sum, child) => sum + calculateNodeValue(child), 0);
        }
        return 0;
    };

    // Value formatter: støtter desimaler og auto-prefix (k/M)
    const formatValue = (val) => {
        if (typeof val !== 'number' || isNaN(val)) return '–';
        if (autoPrefix) {
            if (Math.abs(val) >= 1_000_000) {
                return `${(val / 1_000_000).toFixed(decimals).replace('.', ',')} M`;
            }
            if (Math.abs(val) >= 1_000) {
                return `${(val / 1_000).toFixed(decimals).replace('.', ',')} k`;
            }
        }
        return val.toFixed(decimals).replace('.', ',');
    };

    const rootNode = useMemo(() =>
        settings.hierarchy || { name: tile.name || 'Root', children: [] }
        , [settings.hierarchy, tile.name]);

    const currentNode = getNode(rootNode, path);
    const currentValue = useMemo(() => calculateNodeValue(currentNode), [currentNode, devices]);
    const rootValue = useMemo(() => calculateNodeValue(rootNode), [rootNode, devices]);

    // Forbered barn: filtrer og sorter basert på innstillinger
    const prepareChildren = (node) => {
        if (!node?.children) return [];
        let children = node.children.map((child, originalIndex) => ({ child, originalIndex }));
        if (hideZero) {
            children = children.filter(({ child }) => calculateNodeValue(child) !== 0);
        }
        if (sortByValue) {
            children = [...children].sort((a, b) => calculateNodeValue(b.child) - calculateNodeValue(a.child));
        }
        return children;
    };

    const handleDrillDown = (originalIndex) => {
        setPath([...path, originalIndex]);
    };

    const handleBack = () => {
        setPath(path.slice(0, -1));
    };

    const getThemeStyle = (themeName) => {
        switch (themeName) {
            case 'power':
                return {
                    background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
                    color: 'white',
                    padding: '16px'
                };
            case 'money':
                return {
                    background: 'linear-gradient(135deg, #134E5E 0%, #71B280 100%)',
                    color: 'white',
                    padding: '16px'
                };
            default:
                return {
                    background: 'transparent',
                    color: 'inherit',
                    padding: '16px'
                };
        }
    };

    const themeStyle = getThemeStyle(theme);

    // --- Kompakt visning ---
    if (!expanded) {
        return (
            <div
                className="tile-content"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'absolute',
                    inset: 0,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    ...themeStyle
                }}
            >
                <div style={{ marginBottom: '8px', color: rootNode.color || (theme !== 'default' ? 'rgba(255,255,255,0.9)' : 'var(--color-accent)') }}>
                    {getIcon(rootNode.icon, 24, theme)}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px', textAlign: 'center', maxWidth: '90%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {rootNode.name}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2, color: rootNode.color || 'inherit' }}>
                    {formatValue(rootValue)} <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{unit}</span>
                </div>
            </div>
        );
    }

    // --- Utvidet visning ---
    if (!currentNode) return <div className="p-4">Node ikke funnet</div>;

    const preparedChildren = prepareChildren(currentNode);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            flex: 1,
            color: 'var(--color-text-primary)',
            ...themeStyle,
            padding: 0,
            boxSizing: 'border-box'
        }}>
            {/* Header / Breadcrumbs */}
            <div style={{
                padding: '16px',
                paddingRight: '120px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}>
                {path.length > 0 && (
                    <button onClick={handleBack} className="icon-btn" style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '50%', padding: '8px' }}>
                        <ArrowLeft size={20} />
                    </button>
                )}
                <div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.7, display: 'flex', gap: '4px' }}>
                        <span onClick={() => setPath([])} style={{ cursor: 'pointer' }}>{rootNode.name || 'Huset'}</span>
                        {path.map((idx, i) => {
                            const partialPath = path.slice(0, i + 1);
                            const node = getNode(rootNode, partialPath);
                            return (
                                <React.Fragment key={i}>
                                    <span>/</span>
                                    <span onClick={() => setPath(partialPath)} style={{ cursor: 'pointer' }}>{node?.name || '...'}</span>
                                </React.Fragment>
                            );
                        })}
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                        {currentNode.name || 'Detaljer'}
                    </div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                    {formatValue(currentValue)} <span style={{ fontSize: '1rem', opacity: 0.7 }}>{unit}</span>
                </div>
            </div>

            {/* Liste over barn */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {preparedChildren.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {preparedChildren.map(({ child, originalIndex }) => {
                            const val = calculateNodeValue(child);
                            const hasSubChildren = child.children && child.children.length > 0;
                            const isNavigable = !child.deviceId && hasSubChildren;
                            const pct = currentValue > 0 ? Math.min(100, (val / currentValue) * 100) : 0;

                            return (
                                <div
                                    key={originalIndex}
                                    onClick={() => isNavigable && handleDrillDown(originalIndex)}
                                    style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        borderRadius: '12px',
                                        padding: '16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        cursor: isNavigable ? 'pointer' : 'default',
                                        transition: 'background 0.2s',
                                        overflow: 'hidden',
                                        position: 'relative'
                                    }}
                                >
                                    {/* Prosentbar i bakgrunnen */}
                                    {showPercentage && (
                                        <div style={{
                                            position: 'absolute',
                                            left: 0,
                                            top: 0,
                                            bottom: 0,
                                            width: `${pct}%`,
                                            background: child.color
                                                ? `${child.color}18`
                                                : 'rgba(255,255,255,0.04)',
                                            borderRadius: '12px',
                                            transition: 'width 0.4s ease',
                                            pointerEvents: 'none'
                                        }} />
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                                width: '40px', height: '40px',
                                                borderRadius: '50%',
                                                background: child.color ? `${child.color}20` : 'rgba(255,255,255,0.1)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: child.color || 'white',
                                                flexShrink: 0
                                            }}>
                                                {getIcon(child.icon, 20, theme)}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{child.name}</span>
                                                {hasSubChildren && !child.deviceId && (() => {
                                                    const deviceCount = child.children.filter(c => c.deviceId).length;
                                                    const groupCount = child.children.length - deviceCount;
                                                    let label = '';
                                                    if (groupCount > 0) label += `${groupCount} undergrupper`;
                                                    if (deviceCount > 0) label += `${label ? ', ' : ''}${deviceCount} enheter`;
                                                    return <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{label}</span>;
                                                })()}
                                                {child.deviceId && (
                                                    <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                                                        {devices.find(d => d.id === child.deviceId)?.name || 'Ukjent enhet'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '16px' }}>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: child.color || 'inherit' }}>
                                                    {formatValue(val)} <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{unit}</span>
                                                </span>
                                                {showPercentage && currentValue > 0 && (
                                                    <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                                                        {pct.toFixed(1).replace('.', ',')} %
                                                    </div>
                                                )}
                                            </div>
                                            {isNavigable && <ChevronRight size={20} style={{ opacity: 0.5 }} />}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '40px' }}>
                        {hideZero ? 'Ingen aktive enheter' : 'Ingen underenheter'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HierarchyTile;
