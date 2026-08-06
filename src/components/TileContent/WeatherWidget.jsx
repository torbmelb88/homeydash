import React, { useState, useEffect } from 'react';
import { Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Wind, Droplets, Calendar, Umbrella, Thermometer } from 'lucide-react';
import useIsMobile from '../../hooks/useIsMobile';

// Module-level cache shared across all WeatherWidget instances (compact + expanded)
const weatherCache = {};
const CACHE_TTL = 30 * 60 * 1000;

const WeatherWidget = ({ tile, expanded = false, onContentUpdate }) => {
    const location = tile.settings?.location || 'Oslo';

    // Utvidet visning – valgbare seksjoner (default på)
    const showStats  = tile.settings?.showStats !== false;
    const showHourly = tile.settings?.showHourly !== false;
    const showDaily  = tile.settings?.showDaily !== false;

    const getCached = () => {
        const c = weatherCache[location];
        return c && Date.now() - c.timestamp < CACHE_TTL ? c.data : null;
    };

    const [weather, setWeather] = useState(getCached);
    const isMobile = useIsMobile();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Update size when expanded/collapsed or when weather data loads
    useEffect(() => {
        if (onContentUpdate) onContentUpdate();
    }, [expanded, weather, onContentUpdate]);

    useEffect(() => {
        const fetchWeather = async () => {
            if (!location) return;
            // Skip fetch if cache is still fresh
            const cached = getCached();
            if (cached) { setWeather(cached); return; }
            setLoading(true);
            setError(null);
            try {
                // 1. Geocoding
                const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
                const geoData = await geoRes.json();

                if (!geoData.results || geoData.results.length === 0) {
                    throw new Error('Fant ikke sted');
                }

                const { latitude, longitude, name } = geoData.results[0];

                // 2. Fetch Weather (Current + Daily Forecast + Hourly)
                const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,apparent_temperature,relative_humidity_2m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=temperature_2m,weather_code&wind_speed_unit=ms&timezone=auto&forecast_days=7`);
                const weatherData = await weatherRes.json();

                const data = {
                    current: {
                        temp: weatherData.current.temperature_2m,
                        code: weatherData.current.weather_code,
                        wind: weatherData.current.wind_speed_10m,
                        feelsLike: weatherData.current.apparent_temperature,
                        humidity: weatherData.current.relative_humidity_2m,
                        precip: weatherData.current.precipitation
                    },
                    daily: weatherData.daily,
                    hourly: weatherData.hourly,
                    name: name
                };
                weatherCache[location] = { data, timestamp: Date.now() };
                setWeather(data);

            } catch (err) {
                console.error("Weather fetch error", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchWeather();

        // Refresh every 30 mins
        const interval = setInterval(fetchWeather, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [location]);

    const getWeatherIcon = (code, size = 24) => {
        const color = "white"; // Always white on colored backgrounds
        if (code === 0) return <Sun size={size} color={color} />;
        if (code >= 1 && code <= 3) return <Cloud size={size} color={color} />;
        if (code >= 45 && code <= 48) return <Cloud size={size} color={color} />;
        if (code >= 51 && code <= 67) return <CloudRain size={size} color={color} />;
        if (code >= 71 && code <= 77) return <CloudSnow size={size} color={color} />;
        if (code >= 80 && code <= 82) return <CloudRain size={size} color={color} />;
        if (code >= 85 && code <= 86) return <CloudSnow size={size} color={color} />;
        if (code >= 95 && code <= 99) return <CloudLightning size={size} color={color} />;
        return <Sun size={size} color={color} />;
    };

    const getWeatherGradient = (code) => {
        // Clear/Sunny
        if (code === 0) return 'linear-gradient(to bottom right, #3b82f6, #06b6d4)'; // Blue to Cyan
        // Cloudy
        if (code >= 1 && code <= 3) return 'linear-gradient(to bottom right, #64748b, #94a3b8)'; // Grayish Blue
        // Fog
        if (code >= 45 && code <= 48) return 'linear-gradient(to bottom right, #475569, #64748b)'; // Dark Gray
        // Rain
        if (code >= 51 && code <= 67) return 'linear-gradient(to bottom right, #334155, #475569)'; // Dark Blue-Gray
        // Snow
        if (code >= 71 && code <= 77) return 'linear-gradient(to bottom right, #94a3b8, #cbd5e1)'; // Cold Gray/White
        // Heavy Rain/Showers
        if (code >= 80 && code <= 82) return 'linear-gradient(to bottom right, #1e293b, #334155)'; // Very Dark Blue
        // Thunderstorm
        if (code >= 95 && code <= 99) return 'linear-gradient(to bottom right, #312e81, #5b21b6)'; // Deep Purple/Indigo

        return 'linear-gradient(to bottom right, #3b82f6, #06b6d4)'; // Default
    };

    const getDayName = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('no-NO', { weekday: 'short' }).replace('.', '');
    };

    const getHour = (timeStr) => {
        return new Date(timeStr).getHours();
    };

    if (loading && !weather) return <div className="tile-content" style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Laster vær...</div>;
    if (error) return <div className="tile-content" style={{ color: 'var(--color-error)', padding: '8px' }}>{error}</div>;
    if (!weather) return <div className="tile-content">Ingen værdata</div>;

    const bgGradient = getWeatherGradient(weather.current.code);

    // Expanded View
    if (expanded) {
        // Prepare next 24h hourly data
        const currentHourIndex = new Date().getHours();
        // OpenMeteo hourly starts at 00:00 of current day. So index = currentHour
        // We want next 24 items
        const next24Hours = weather.hourly.time.slice(currentHourIndex, currentHourIndex + 24).map((t, i) => ({
            time: t,
            temp: weather.hourly.temperature_2m[currentHourIndex + i],
            code: weather.hourly.weather_code[currentHourIndex + i]
        }));

        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                background: bgGradient,
                color: 'white',
                padding: isMobile ? '16px' : '24px',
                paddingTop: '4rem', // Space for the absolute-positioned close button
                borderRadius: 'inherit',
                boxSizing: 'border-box',
            }}>
                {/* Header Section */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: isMobile ? '20px' : '28px' }}>
                    <h2 style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 600, margin: 0 }}>{weather.name}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: isMobile ? '10px 0' : '14px 0' }}>
                        {getWeatherIcon(weather.current.code, isMobile ? 56 : 72)}
                        <span style={{ fontSize: isMobile ? '3.5rem' : '4.5rem', fontWeight: 700, lineHeight: 1 }}>
                            {Math.round(weather.current.temp)}°
                        </span>
                    </div>
                    <div style={{ fontSize: '1rem', opacity: 0.9 }}>
                        Føles som {Math.round(weather.current.feelsLike)}°
                    </div>

                    {/* Stats Grid */}
                    {showStats && (
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: isMobile ? '12px' : '20px',
                        width: '100%',
                        marginTop: isMobile ? '16px' : '24px',
                        background: 'rgba(255,255,255,0.1)',
                        padding: isMobile ? '12px' : '16px',
                        borderRadius: '16px'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <Wind size={isMobile ? 20 : 24} style={{ opacity: 0.8 }} />
                            <span style={{ fontSize: isMobile ? '1rem' : '1.2rem', fontWeight: 600 }}>{weather.current.wind}</span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>m/s</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <Droplets size={isMobile ? 20 : 24} style={{ opacity: 0.8 }} />
                            <span style={{ fontSize: isMobile ? '1rem' : '1.2rem', fontWeight: 600 }}>{weather.current.humidity}%</span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Fuktighet</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <Umbrella size={isMobile ? 20 : 24} style={{ opacity: 0.8 }} />
                            <span style={{ fontSize: isMobile ? '1rem' : '1.2rem', fontWeight: 600 }}>{weather.current.precip}</span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>mm nå</span>
                        </div>
                    </div>
                    )}
                </div>

                {/* Hourly Scroll */}
                {showHourly && (
                <div style={{ marginBottom: isMobile ? '20px' : '28px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '12px', opacity: 0.9, paddingLeft: '4px' }}>Neste 24 timer</h3>
                    <div className="no-scrollbar" style={{
                        display: 'flex',
                        overflowX: 'auto',
                        gap: isMobile ? '8px' : '12px',
                        padding: '6px 2px 12px 2px',
                        WebkitOverflowScrolling: 'touch',
                        touchAction: 'pan-x pan-y',
                        overscrollBehavior: 'contain',
                        scrollbarWidth: 'none'
                    }}>
                        {next24Hours.map((h, i) => (
                            <div key={i} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                minWidth: isMobile ? '52px' : '60px',
                                padding: isMobile ? '8px 6px' : '10px',
                                background: 'rgba(255,255,255,0.08)', borderRadius: '12px',
                                gap: '6px'
                            }}>
                                <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                    {getHour(h.time).toString().padStart(2, '0')}:00
                                </span>
                                {getWeatherIcon(h.code, isMobile ? 18 : 22)}
                                <span style={{ fontSize: isMobile ? '1rem' : '1.1rem', fontWeight: 600 }}>
                                    {Math.round(h.temp)}°
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                )}

                {/* 7-Day Forecast */}
                {showDaily && (
                <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '12px', opacity: 0.9, paddingLeft: '4px' }}>7-dagers varsel</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {weather.daily.time.map((t, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: isMobile ? '10px 12px' : '12px 16px',
                                background: 'rgba(255,255,255,0.08)', borderRadius: '10px'
                            }}>
                                <span style={{ width: isMobile ? '60px' : '80px', fontWeight: 600, fontSize: isMobile ? '0.9rem' : '1rem', textTransform: 'capitalize' }}>
                                    {i === 0 ? 'I dag' : getDayName(t)}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center' }}>
                                    {getWeatherIcon(weather.daily.weather_code[i], isMobile ? 18 : 22)}
                                    <span style={{ fontSize: '0.8rem', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <Umbrella size={12} /> {weather.daily.precipitation_probability_max[i]}%
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', width: isMobile ? '70px' : '80px', justifyContent: 'flex-end' }}>
                                    <span style={{ fontWeight: 600, fontSize: isMobile ? '0.9rem' : '1rem' }}>{Math.round(weather.daily.temperature_2m_max[i])}°</span>
                                    <span style={{ opacity: 0.6, fontSize: isMobile ? '0.85rem' : '1rem' }}>{Math.round(weather.daily.temperature_2m_min[i])}°</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                )}
            </div>
        );
    }

    // Default Tile View
    return (
        <div className="tile-content" style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            background: bgGradient,
            color: 'white',
            padding: '8px',
            boxSizing: 'border-box',
            borderRadius: 'var(--radius-lg)'
        }}>
            {/* Top Section: Current Weather */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {getWeatherIcon(weather.current.code, 40)}
                    <span style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1 }}>
                        {Math.round(weather.current.temp)}°
                    </span>
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 500, marginTop: '4px', opacity: 0.9 }}>
                    {weather.name}
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <Wind size={12} />
                    {weather.current.wind} m/s
                </div>
            </div>

            {/* Bottom Section: 3-Day Forecast (Preview) */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.2)',
                width: '100%',
                gap: '4px'
            }}>
                {[0, 1, 2].map(i => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'capitalize', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {i === 0 ? 'I dag' : getDayName(weather.daily.time[i])}
                        </span>
                        <div style={{ margin: '2px 0' }}>
                            {getWeatherIcon(weather.daily.weather_code[i], 18)}
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {Math.round(weather.daily.temperature_2m_max[i])}°
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default WeatherWidget;
