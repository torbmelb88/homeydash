import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useHomey } from '../context/HomeyContext';
import Tile from './Tile';
import SortableTile from './SortableTile';
import AddTileModal from './AddTileModal';
import TileSettingsModal from './TileSettingsModal';
import { Plus, Layers, Zap } from 'lucide-react';
import { storage } from '../services/storage';
import {
    DndContext,
    DragOverlay,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    TouchSensor,
    MouseSensor
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    rectSwappingStrategy,
} from '@dnd-kit/sortable';

import ConfirmModal from './ConfirmModal';

const TileGrid = () => {
    const { currentPage, isEditMode, settings, pages } = useHomey();

    const [tiles, setTiles] = useState([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [editingTile, setEditingTile] = useState(null);
    const [tileToDelete, setTileToDelete] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const [dragHeight, setDragHeight] = useState(null);
    const [pristineTiles, setPristineTiles] = useState(null);

    const activeTile = activeId ? tiles.find(t => t.id === activeId) : null;

    useEffect(() => {
        const loadTiles = async () => {
            const storedTiles = await storage.get('tiles');
            setTiles(storedTiles || []);
        };
        loadTiles();
    }, []);

    // ── «Fyll ned til bunnen av flis» (settings.stretchToTileId) ─────────────────
    // Rutenettet vet ikke hva en «rad» er; hver flis setter sitt eget span. Etter at flisene
    // har rapportert naturlig høyde, leses faktisk posisjon fra DOM: en flis med referanse
    // forlenges fra sin naturlige bunn ned til referanseflisens bunn — men bare når de to
    // faktisk ligger side om side (vertikalt overlapp). Ellers gjør den ingenting, så
    // mobil-reflow og redigeringsmodus (radflyt uten tett pakking) degraderer ufarlig.
    const [extraRows, setExtraRows] = useState({});
    const gridRefs = useRef({});
    const passRef = useRef({ raf: 0, iterations: 0 });
    const activeIdRef = useRef(null);
    activeIdRef.current = activeId;

    const runStretchPass = useCallback(() => {
        passRef.current.raf = 0;
        if (activeIdRef.current) return; // under drag er posisjonene transformert
        const grid = gridRefs.current[currentPage];

        const cs = window.getComputedStyle(grid);
        const rowH = parseFloat(cs.getPropertyValue('grid-auto-rows')) || 16;
        const gap = parseFloat(cs.getPropertyValue('gap').split(' ')[0]) || 16;
        const unit = rowH + gap;

        const elems = {};
        grid.querySelectorAll(':scope > [data-sortable-tile-id]').forEach(el => {
            elems[el.dataset.sortableTileId] = el;
        });

        const next = {};
        for (const t of tiles) {
            if (t.pageId !== currentPage) continue;
            const refId = t.settings?.stretchToTileId;
            if (!refId || refId === t.id) continue;
            const me = elems[t.id];
            const ref = elems[refId];
            if (!me || !ref) continue;
            const natural = parseInt(me.dataset.naturalRows, 10);
            if (!natural) continue;

            const meRect = me.getBoundingClientRect();
            const refRect = ref.getBoundingClientRect();
            const naturalBottom = meRect.top + natural * unit - gap;

            // Ligger de side om side? Referansen må overlappe min naturlige høyde.
            const sideBySide = refRect.top < naturalBottom - 1 && refRect.bottom > meRect.top + 1;
            if (!sideBySide) continue;

            const extra = Math.round((refRect.bottom - naturalBottom) / unit);
            if (extra > 0) next[t.id] = extra;
        }

        setExtraRows(prev => {
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(next);
            const same = prevKeys.length === nextKeys.length && nextKeys.every(k => prev[k] === next[k]);
            if (same) { passRef.current.iterations = 0; return prev; }
            // Kjedede/sirkulære referanser kan ellers vokse i det uendelige.
            if (++passRef.current.iterations > 6) return prev;
            return next;
        });
    }, [tiles, currentPage]);

    const scheduleStretchPass = useCallback(() => {
        if (passRef.current.raf) return;
        passRef.current.raf = requestAnimationFrame(runStretchPass);
    }, [runStretchPass]);

    // Kjør på nytt når spans/ekstra rader er påført DOM, ved sidebytte, moduskifte og
    // vindusstørrelse (kolonnetallet endrer hvem som er nabo).
    useEffect(() => { scheduleStretchPass(); }, [scheduleStretchPass, extraRows, isEditMode, activeId]);
    useEffect(() => {
        window.addEventListener('resize', scheduleStretchPass);
        return () => {
            window.removeEventListener('resize', scheduleStretchPass);
            if (passRef.current.raf) cancelAnimationFrame(passRef.current.raf);
            passRef.current.raf = 0;
        };
    }, [scheduleStretchPass]);

    // Helper to get tiles for the *current active* page (for drag logic)
    const getActivePageTiles = () => tiles.filter(t => t.pageId === currentPage);

    // Calculate grid styles based on settings
    const getGridStyles = () => {
        const styles = {};

        // Columns
        if (settings.gridColumns && settings.gridColumns !== 'auto') {
            styles['--grid-columns'] = `repeat(${settings.gridColumns}, 1fr)`;
        }

        // Row Height / Density
        if (settings.gridDensity) {
            const densityMap = {
                'compact': '12px',
                'normal': '16px',
                'spacious': '24px'
            };
            styles['--grid-row-height'] = densityMap[settings.gridDensity] || '16px';
        }

        return styles;
    };

    const handleEditTile = (tile) => {
        setEditingTile(tile);
    };

    const handleSaveTile = async (updatedTile) => {
        const newTiles = tiles.map(t => t.id === updatedTile.id ? updatedTile : t);
        setTiles(newTiles);
        await storage.set('tiles', newTiles);
        setEditingTile(null);
    };

    const handleDeleteTile = (tileId) => {
        setTileToDelete(tileId);
    };

    const confirmDelete = async () => {
        if (!tileToDelete) return;
        const idToDelete = tileToDelete;
        const newTiles = tiles.filter(t => t.id !== idToDelete);
        setTiles(newTiles);
        setTileToDelete(null);
        if (editingTile && editingTile.id === idToDelete) setEditingTile(null);
        await storage.set('tiles', newTiles);
        await storage.delete('tiles', idToDelete);
    };

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
        setPristineTiles(tiles);
        const node = event.active.node?.current || event.active.node;
        if (node) setDragHeight(node.getBoundingClientRect().height);
    };

    const handleDragOver = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setTiles((currentTiles) => {
            const pageTiles = currentTiles.filter(t => t.pageId === currentPage);
            const otherTiles = currentTiles.filter(t => t.pageId !== currentPage);
            const oldIndex = pageTiles.findIndex(t => t.id === active.id);
            const newIndex = pageTiles.findIndex(t => t.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return currentTiles;
            const reordered = arrayMove(pageTiles, oldIndex, newIndex);
            return [...otherTiles, ...reordered];
        });
    };

    const handleDragCancel = () => {
        setActiveId(null);
        setDragHeight(null);
        if (pristineTiles) {
            setTiles(pristineTiles);
            setPristineTiles(null);
        }
    };

    const handleDragEnd = async () => {
        setActiveId(null);
        setDragHeight(null);
        setPristineTiles(null);

        setTiles(currentTiles => {
            storage.set('tiles', currentTiles).catch(console.error);
            return currentTiles;
        });
    };

    // Sensor Configuration:
    // Mouse: Move 10px to start drag (prevents accidental clicks)
    // Touch: Hold 250ms to start drag (differentiates from scroll)
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 10,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250,
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    if (!currentPage && pages.length === 0) return <div className="p-8 text-center text-gray-400">Ingen sider</div>;

    const GridContent = (
        <>
            {pages.map(page => {
                const pageTiles = tiles.filter(t => t.pageId === page.id);
                const isActive = page.id === currentPage;

                return (
                    <div
                        key={page.id}
                        ref={el => { gridRefs.current[page.id] = el; }}
                        className="tile-grid"
                        style={{
                            ...getGridStyles(),
                            display: isActive ? 'grid' : 'none'
                        }}
                    >
                        <SortableContext
                            items={pageTiles.map(t => t.id)}
                            strategy={rectSortingStrategy}
                        >
                            {pageTiles.map(tile => (
                                <SortableTile
                                    key={tile.id}
                                    tile={tile}
                                    onEdit={handleEditTile}
                                    onDelete={handleDeleteTile}
                                    isEditMode={isEditMode}
                                    isVisible={isActive}
                                    extraRows={extraRows[tile.id] || 0}
                                    onSpanChange={scheduleStretchPass}
                                />
                            ))}
                        </SortableContext>
                    </div>
                );
            })}

            {isEditMode && currentPage && (
                <div className="add-tile-container" style={{ position: 'fixed', bottom: 'var(--spacing-xl)', right: 'var(--spacing-xl)', zIndex: 700, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
                    <button className="add-tile-btn" onClick={() => setShowAddModal(true)} style={{ position: 'static' }}>
                        <Plus size={24} />
                        <span>Legg til flis</span>
                    </button>
                </div>
            )}

            {showAddModal && (
                <AddTileModal
                    onClose={() => setShowAddModal(false)}
                    onAdd={async (newTile) => {
                        const tileWithPage = { ...newTile, pageId: currentPage };
                        const newTilesList = [...tiles, tileWithPage];
                        setTiles(newTilesList);
                        await storage.set('tiles', newTilesList);
                        setShowAddModal(false);
                    }}
                />
            )}

            {editingTile && (
                <TileSettingsModal
                    tile={editingTile}
                    pageTiles={tiles.filter(t => t.pageId === editingTile.pageId)}
                    onClose={() => setEditingTile(null)}
                    onSave={handleSaveTile}
                    onDelete={handleDeleteTile}
                />
            )}

            {tileToDelete && (
                <ConfirmModal
                    title="Slett flis"
                    message="Er du sikker på at du vil slette denne flisen? Dette kan ikke angres."
                    onConfirm={confirmDelete}
                    onCancel={() => setTileToDelete(null)}
                    isDangerous={true}
                />
            )}
        </>
    );

    return isEditMode ? (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            {GridContent}

            <DragOverlay zIndex={10000} dropAnimation={null}>
                {activeTile ? (
                    <div style={{ pointerEvents: 'none', height: dragHeight || undefined }}>
                        <Tile
                            tile={activeTile}
                            onEdit={() => {}}
                            onDelete={() => {}}
                            onResize={() => {}}
                            style={{
                                cursor: 'grabbing',
                                opacity: 0.9,
                                transform: 'scale(1.03)',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                                height: '100%',
                            }}
                        />
                    </div>
                ) : null}
            </DragOverlay>

        </DndContext>
    ) : (
        GridContent
    );
};

export default TileGrid;
