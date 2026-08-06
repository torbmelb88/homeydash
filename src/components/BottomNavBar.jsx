import React, { useState } from 'react';
import { useHomey } from '../context/HomeyContext';
import * as Icons from 'lucide-react';
import PageModal from './PageModal';

const BottomNavBar = () => {
    const { pages, currentPage, setCurrentPage, settings, isEditMode, addPage, updatePage, deletePage, reorderPages } = useHomey();

    const [showPageModal, setShowPageModal] = useState(false);
    const [editingPage, setEditingPage] = useState(null);

    const activePage = pages?.find(p => p.id === currentPage);

    // Only render if we have pages and panel mode is enabled
    // Exception: If in edit mode, even 0 pages should render the bar so we can click [+]
    // Exception: If NOT in edit mode and the current page is an iframe, hide the bar to maximize space
    if (!settings?.panelMode || (!isEditMode && (!pages || pages.length === 0 || activePage?.iframeUrl || activePage?.pageType === 'family' || activePage?.pageType === 'music' || activePage?.pageType === 'media'))) return null;

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

    const handleDeletePage = async () => {
        if (editingPage) {
            try {
                await deletePage(editingPage.id);
                setShowPageModal(false);
                setEditingPage(null);
            } catch (error) {
                console.error('Failed to delete page:', error);
            }
        }
    };

    // Indeks slås opp i live pages-lista slik at posisjonen i modalen følger med når man flytter
    const editingIndex = editingPage ? pages.findIndex(p => p.id === editingPage.id) : -1;

    const handleMovePage = (dir) => {
        const from = editingIndex;
        const to = from + dir;
        if (from < 0 || to < 0 || to >= pages.length) return;
        const newPages = [...pages];
        const [moved] = newPages.splice(from, 1);
        newPages.splice(to, 0, moved);
        reorderPages(newPages);
    };

    const openEditModal = (page) => {
        setEditingPage(page);
        setShowPageModal(true);
    };

    const openNewPageModal = () => {
        setEditingPage(null);
        setShowPageModal(true);
    };

    return (
        <>
            <div style={{
                flexShrink: 0,
                width: '100%',
                height: '60px', /* Tall enough for fat thumbs */
                backgroundColor: 'var(--color-bg-secondary)',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: pages.length > 4 ? 'flex-start' : 'space-around',
                alignItems: 'center',
                zIndex: 1000,
                paddingBottom: 'env(safe-area-inset-bottom)', /* iOS/Android safety */
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none', /* Hide scrollbar Firefox */
                msOverflowStyle: 'none', /* Hide scrollbar IE/Edge */
            }} className="no-scrollbar">
                {pages.map(page => {
                    const isActive = page.id === currentPage;
                    const IconComponent = Icons[page.icon] || Icons.Circle;

                    return (
                        <button
                            key={page.id}
                            onClick={() => isEditMode ? openEditModal(page) : setCurrentPage(page.id)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: isActive && !isEditMode ? 'var(--color-accent-primary)' : 'var(--color-text-tertiary)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: '75px', // Ensure tabs don't shrink too much when scrolling
                                height: '100%',
                                transition: 'color 0.2s',
                                cursor: 'pointer',
                                position: 'relative'
                            }}
                        >
                            <IconComponent size={24} style={{ marginBottom: '4px' }} />
                            <span style={{
                                fontSize: '0.65rem',
                                fontWeight: isActive && !isEditMode ? 600 : 400,
                                display: 'block',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '100%',
                                padding: '0 4px',
                                color: isEditMode ? 'var(--color-text-secondary)' : 'inherit'
                            }}>
                                {isEditMode ? 'Rediger' : page.name}
                            </span>
                            {isEditMode && (
                                <div style={{
                                    position: 'absolute',
                                    top: '4px',
                                    right: '12px',
                                    backgroundColor: 'var(--color-primary)',
                                    color: 'white',
                                    borderRadius: '50%',
                                    width: '14px',
                                    height: '14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 0 5px rgba(0,0,0,0.5)'
                                }}>
                                    <Icons.Edit2 size={8} />
                                </div>
                            )}
                        </button>
                    );
                })}

                {/* Add Page Button visible only in Edit Mode */}
                {isEditMode && (
                    <button
                        onClick={openNewPageModal}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-success)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '75px',
                            height: '100%',
                            cursor: 'pointer',
                        }}
                    >
                        <Icons.Plus size={24} style={{ marginBottom: '4px' }} />
                        <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Ny Side</span>
                    </button>
                )}
            </div>

            <PageModal
                isOpen={showPageModal}
                onClose={() => {
                    setShowPageModal(false);
                    setEditingPage(null);
                }}
                onSave={handleSavePage}
                onDelete={editingPage ? handleDeletePage : undefined}
                initialName={editingPage?.name || ''}
                initialIcon={editingPage?.icon || 'FileText'}
                initialIframeUrl={editingPage?.iframeUrl || ''}
                initialPageType={editingPage?.pageType || 'tile'}
                title={editingPage ? 'Rediger side' : 'Ny side'}
                pageIndex={editingIndex}
                pageCount={pages.length}
                onMove={editingPage ? handleMovePage : undefined}
            />
        </>
    );
};

export default BottomNavBar;
