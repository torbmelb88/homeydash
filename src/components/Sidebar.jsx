import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useHomey } from '../context/HomeyContext';
import { X, Plus, FileText, Edit2, GripVertical } from 'lucide-react';
import * as Icons from 'lucide-react';
import PageModal from './PageModal';
import ConfirmModal from './ConfirmModal';
import {
    DndContext,
    DragOverlay,
    closestCenter,
    closestCorners,
    KeyboardSensor,
    MouseSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Components ---

// 1. Pure Presentation Component (No DnD logic)
const PageItem = ({ page, isActive, onClick, isEditMode, onEdit, onDelete, dragHandleProps, ...props }) => {
    const IconComponent = Icons[page.icon] || FileText;

    return (
        <div
            className={`page-item ${isActive ? 'active' : ''}`}
            onClick={onClick}
            style={props.style}
        >
            {isEditMode && (
                // Drag only from the grip handle so the rest of the card keeps
                // native touch scrolling (touch-action: none lives on .drag-handle)
                <div className="drag-handle" {...dragHandleProps}>
                    <GripVertical />
                </div>
            )}
            <IconComponent size={20} />
            <span className="page-name">{page.name}</span>

            {isEditMode && (
                <div className="page-actions">
                    <button
                        className="page-action-btn edit"
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit(page);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{ marginRight: '4px' }}
                    >
                        <Edit2 size={14} />
                    </button>
                    <button
                        className="page-action-btn delete"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onDelete(e, page.id);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
        </div>
    );
};

// 2. Sortable Wrapper (Only used in Edit Mode)
const SortablePageItemWrapper = (props) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging, // Get isDragging state
    } = useSortable({ id: props.page.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1, // Fade out original when dragging
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            <PageItem {...props} dragHandleProps={listeners} />
        </div>
    );
};

const Sidebar = ({ isOpen, onClose }) => {
    const { pages, currentPage, setCurrentPage, addPage, deletePage, updatePage, reorderPages, isEditMode } = useHomey();
    const [showPageModal, setShowPageModal] = useState(false);
    const [editingPage, setEditingPage] = useState(null);
    const [pageToDelete, setPageToDelete] = useState(null);

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 10,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 100, // Short press on the grip handle starts the drag
                tolerance: 5, // Allow slight movement during press
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleSavePage = async (name, icon, iframeUrl, pageType = 'tile') => {
        try {
            if (editingPage) {
                await updatePage({ ...editingPage, name, icon, iframeUrl, pageType });
            } else {
                await addPage(name, icon, iframeUrl, pageType);
            }
            setShowPageModal(false);
            setEditingPage(null);
        } catch (error) {
            console.error('Failed to save page:', error);
            alert('Kunne ikke lagre side');
        }
    };



    const handleDeleteClick = (e, pageId) => {
        e.stopPropagation();
        const page = pages.find(p => p.id === pageId);
        if (page) {
            setPageToDelete(page);
        }
    };

    const confirmDelete = async () => {
        if (pageToDelete) {
            try {
                await deletePage(pageToDelete.id);
                setPageToDelete(null);
            } catch (error) {
                console.error('Failed to delete page:', error);
            }
        }
    };

    const [activeId, setActiveId] = useState(null);

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const openEditModal = (page) => {
        setEditingPage(page);
        setShowPageModal(true);
    };

    const openNewPageModal = () => {
        setEditingPage(null);
        setShowPageModal(true);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (active && over && active.id !== over.id) {
            const oldIndex = pages.findIndex((page) => page.id === active.id);
            const newIndex = pages.findIndex((page) => page.id === over.id);
            reorderPages(arrayMove(pages, oldIndex, newIndex));
        }
    };

    // --- Adaptive Sidebar Logic ---
    const [isWide, setIsWide] = useState(false);

    React.useEffect(() => {
        const checkCapacity = () => {
            const vh = window.innerHeight;
            const headerHeight = 80; // Approximate
            const footerHeight = isEditMode ? 100 : 0; // "Ny side" button space
            const padding = 40;
            const availableHeight = vh - headerHeight - footerHeight - padding;

            const itemHeight = 74; // 60px height + 12px gap + border/margin approx
            const maxItemsPerColumn = Math.floor(availableHeight / itemHeight);

            // If we have more pages than fit in one column, go wide (2 columns).
            // Never on narrow screens (mobile): the 600px wide sidebar would overflow
            // the viewport and hide the edit/delete buttons in the right column.
            const fitsWide = window.innerWidth >= 768;
            setIsWide(fitsWide && pages.length > maxItemsPerColumn);
        };

        checkCapacity();
        window.addEventListener('resize', checkCapacity);
        return () => window.removeEventListener('resize', checkCapacity);
    }, [pages.length, isEditMode]);

    // Helper to render a simple PageItem
    const renderPageItem = (page) => (
        <PageItem
            key={page.id}
            page={page}
            isActive={page.id === currentPage}
            onClick={() => {
                // In normal mode, click navigates.
                // In edit mode, click does nothing (unless we hit buttons, handled inside)
                if (!isEditMode) {
                    setCurrentPage(page.id);
                    onClose();
                }
            }}
            isEditMode={isEditMode}
            onEdit={openEditModal}
            onDelete={handleDeleteClick}
        />
    );

    const activePage = activeId ? pages.find(p => p.id === activeId) : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className={`sidebar-overlay ${isOpen ? 'active' : ''}`} onClick={onClose}></div>
            <aside className={`sidebar ${isOpen ? 'open' : ''} ${isWide ? 'wide' : ''}`}>
                <div className="sidebar-header">
                    <h2>Sider</h2>
                    <button className="icon-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <div className="page-list">
                    {isEditMode ? (
                        <SortableContext
                            items={pages.map(p => p.id)}
                            strategy={rectSortingStrategy}
                        >
                            {pages.map(page => (
                                <SortablePageItemWrapper
                                    key={page.id}
                                    page={page}
                                    isActive={page.id === currentPage}
                                    onClick={() => { /* Edit mode doesn't nav */ }}
                                    isEditMode={isEditMode}
                                    onEdit={openEditModal}
                                    onDelete={handleDeleteClick}
                                />
                            ))}
                        </SortableContext>
                    ) : (
                        /* Plain Grid View */
                        <div className="page-grid-view" style={{ display: 'contents' }}>
                            {pages.map(renderPageItem)}
                        </div>
                    )}
                </div>

                {isEditMode && (
                    <button
                        className="add-page-btn btn-primary"
                        onClick={openNewPageModal}
                        style={{ margin: '1rem', padding: '1rem', justifyContent: 'center', fontWeight: 'bold' }}
                    >
                        <Plus size={24} style={{ marginRight: '8px' }} />
                        NY SIDE
                    </button>
                )}
            </aside>

            {/* DragOverlay - Render directly (it uses Portal internally) */}
            <DragOverlay zIndex={10000} dropAnimation={null}>
                {activePage ? (
                    <PageItem
                        page={activePage}
                        isActive={activePage.id === currentPage}
                        isEditMode={true}
                        // Pass dummy props for actions
                        onEdit={() => { }}
                        onDelete={() => { }}
                        // Style override for the drag overlay
                        style={{
                            cursor: 'grabbing',
                            opacity: 0.9,
                            transform: 'scale(1.05)',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-primary)',
                            zIndex: 10000,
                            borderRadius: '12px',
                            width: '270px', // Explicit width
                        }}
                        dragHandleProps={{}}
                    />
                ) : null}
            </DragOverlay>

            <PageModal
                isOpen={showPageModal}
                onClose={() => {
                    setShowPageModal(false);
                    setEditingPage(null);
                }}
                onSave={handleSavePage}
                initialName={editingPage?.name || ''}
                initialIcon={editingPage?.icon || 'FileText'}
                initialIframeUrl={editingPage?.iframeUrl || ''}
                initialPageType={editingPage?.pageType || 'tile'}
                title={editingPage ? 'Rediger side' : 'Ny side'}
            />

            {pageToDelete && (
                <ConfirmModal
                    title="Slett side"
                    message={`Er du sikker på at du vil slette siden "${pageToDelete.name}"? Dette kan ikke angres.`}
                    onConfirm={confirmDelete}
                    onCancel={() => setPageToDelete(null)}
                    confirmText="Slett"
                    isDangerous={true}
                />
            )}
        </DndContext>
    );
};

export default Sidebar;
