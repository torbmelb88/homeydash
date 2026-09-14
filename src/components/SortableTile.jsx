import React, { useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Tile from './Tile';

const SortableTile = ({ tile, onEdit, onDelete, isEditMode, isVisible = true, extraRows = 0, onSpanChange }) => {
    // Naturlig høyde (målt av Tile.jsx). extraRows kommer fra TileGrid sitt
    // «Fyll ned til bunnen av flis»-pass og holdes adskilt, så flisen krymper igjen
    // når referanseflisen blir lavere.
    const [rowSpan, setRowSpan] = useState(null);

    useEffect(() => {
        if (rowSpan) onSpanChange?.();
    }, [rowSpan, onSpanChange]);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: tile.id,
        disabled: !isEditMode
    });

    const totalSpan = rowSpan ? rowSpan + (extraRows || 0) : null;

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1, // Ghost effect: 0.3 opacity when dragging
        // zIndex is handled by DragOverlay now
        position: 'relative',
        touchAction: isEditMode ? 'none' : 'manipulation', // Prevents browser scroll interference during drag on touch devices
        gridRowEnd: totalSpan ? `span ${totalSpan}` : undefined
    };

    const size = tile.size || '1x1';

    return (
        <div
            ref={setNodeRef}
            style={{
                ...style,
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                padding: 0,
                minHeight: 0,
            }}
            className={`tile size-${size} type-${tile.type || 'unknown'}`}
            data-sortable-tile-id={tile.id}
            data-natural-rows={rowSpan || ''}
            {...attributes}
            {...listeners}
        >
            <Tile
                tile={tile}
                onEdit={onEdit}
                onDelete={onDelete}
                onResize={setRowSpan}
                isDragEnabled={isEditMode}
                isVisible={isVisible}
                extraRows={extraRows}
            />
        </div>
    );
};

export default SortableTile;
