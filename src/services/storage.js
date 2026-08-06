import { initializeApp } from 'firebase/app';
import {
    getFirestore, collection, doc,
    getDoc, getDocs, setDoc, deleteDoc, writeBatch
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

import { isDemoActive } from './demo-flag';

let db = null;
try {
    // I demo-modus kjører alt mot localStorage – aldri mot Firestore
    if (!isDemoActive && import.meta.env.VITE_FIREBASE_API_KEY) {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
    }
} catch (e) {
    console.warn('Firebase init failed:', e);
}

const PROFILE_KEY = 'dashboardProfile';

class Storage {
    get useFirebase() { return db !== null; }

    // Returns active profile id, or null if none selected
    getActiveProfile() {
        return localStorage.getItem(PROFILE_KEY) || null;
    }

    setActiveProfile(profileId) {
        localStorage.setItem(PROFILE_KEY, profileId);
        // Clear local cache so next reads come from Firebase
        ['pages', 'tiles', 'settings', 'settings_config'].forEach(k => localStorage.removeItem(k));
    }

    clearActiveProfile() {
        localStorage.removeItem(PROFILE_KEY);
    }

    // Firestore collection name scoped to active profile.
    // familyCredentials is never scoped — credentials are global and the
    // server-side token refresher writes to the unscoped collection.
    _col(collectionName) {
        if (collectionName === 'familyCredentials') return collectionName;
        const profile = this.getActiveProfile();
        return profile ? `${collectionName}__${profile}` : collectionName;
    }

    // --- Profile management ---

    async listProfiles() {
        if (!db) return [];
        try {
            const snap = await getDocs(collection(db, 'profiles'));
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn('Failed to list profiles:', e);
            return [];
        }
    }

    async createProfile(name) {
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
        const profile = { id, name, createdAt: Date.now() };
        if (db) {
            await setDoc(doc(db, 'profiles', id), profile);
        }
        return profile;
    }

    async deleteProfile(profileId) {
        if (!db) return;
        // Delete profile metadata
        await deleteDoc(doc(db, 'profiles', profileId));
        // Delete all data collections for this profile
        for (const col of ['pages', 'tiles', 'settings']) {
            const colName = `${col}__${profileId}`;
            const snap = await getDocs(collection(db, colName));
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            if (snap.docs.length) await batch.commit();
        }
    }

    async renameProfile(profileId, newName) {
        if (!db) return;
        await setDoc(doc(db, 'profiles', profileId), { name: newName }, { merge: true });
    }

    // --- Data access (scoped to active profile) ---

    async get(collectionName, id = null) {
        const scopedCol = this._col(collectionName);
        const key = id ? `${collectionName}_${id}` : collectionName;
        const localData = localStorage.getItem(key);
        if (localData) return JSON.parse(localData);

        if (!db) return id ? null : [];

        try {
            if (id) {
                const snap = await getDoc(doc(db, scopedCol, id));
                if (!snap.exists()) return null;
                const data = { id: snap.id, ...snap.data() };
                localStorage.setItem(key, JSON.stringify(data));
                return data;
            } else {
                const snap = await getDocs(collection(db, scopedCol));
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                data.sort((a, b) => (a._order ?? 999999) - (b._order ?? 999999));
                localStorage.setItem(collectionName, JSON.stringify(data));
                return data;
            }
        } catch (e) {
            if (e.code !== 'permission-denied') console.warn('Firebase read failed:', e);
            return id ? null : [];
        }
    }

    async set(collectionName, data, id = null) {
        const scopedCol = this._col(collectionName);

        if (Array.isArray(data)) {
            localStorage.setItem(collectionName, JSON.stringify(data));
            if (db) {
                try {
                    const batch = writeBatch(db);
                    data.forEach((item, index) => {
                        if (item.id) batch.set(doc(db, scopedCol, item.id), { ...item, _order: index });
                    });
                    await batch.commit();
                } catch (e) {
                    if (e.code !== 'permission-denied') console.warn('Firebase batch sync failed:', e);
                }
            }
            return data;
        }

        const itemId = id || data.id || this.generateId();
        const itemData = { ...data, id: itemId, updatedAt: Date.now() };

        if (id) {
            localStorage.setItem(`${collectionName}_${itemId}`, JSON.stringify(itemData));
        } else {
            const existingStr = localStorage.getItem(collectionName);
            const existing = existingStr ? JSON.parse(existingStr) : [];
            const idx = existing.findIndex(item => item.id === itemId);
            if (idx >= 0) existing[idx] = itemData;
            else existing.push(itemData);
            localStorage.setItem(collectionName, JSON.stringify(existing));
        }

        if (db) {
            try {
                await setDoc(doc(db, scopedCol, itemId), itemData, { merge: true });
            } catch (e) {
                if (e.code !== 'permission-denied') console.warn('Firebase sync failed:', e);
            }
        }

        return itemData;
    }

    async delete(collectionName, id) {
        const scopedCol = this._col(collectionName);
        localStorage.removeItem(`${collectionName}_${id}`);
        const existingStr = localStorage.getItem(collectionName);
        const existing = existingStr ? JSON.parse(existingStr) : [];
        const filtered = existing.filter(item => item.id !== id);
        localStorage.setItem(collectionName, JSON.stringify(filtered));

        if (db) {
            try {
                await deleteDoc(doc(db, scopedCol, id));
            } catch (e) {
                if (e.code !== 'permission-denied') console.warn('Firebase delete failed:', e);
            }
        }
    }

    async exportData() {
        // Always fetch fresh from Firebase to avoid stale localStorage cache
        const fresh = async (collectionName, id = null) => {
            if (!db) return id ? null : [];
            try {
                if (id) {
                    const snap = await getDoc(doc(db, this._col(collectionName), id));
                    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
                }
                const snap = await getDocs(collection(db, this._col(collectionName)));
                const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                items.sort((a, b) => (a._order ?? 999999) - (b._order ?? 999999));
                return items;
            } catch (e) {
                return id ? null : [];
            }
        };
        return {
            pages: await fresh('pages') || [],
            tiles: await fresh('tiles') || [],
            settings: await fresh('settings', 'config') || {},
            exportedAt: new Date().toISOString()
        };
    }

    async importData(data) {
        const scopedPages = this._col('pages');
        const scopedTiles = this._col('tiles');
        const scopedSettings = this._col('settings');

        if (db) {
            // Delete all existing docs in each collection before writing new ones
            const purge = async (colName) => {
                const snap = await getDocs(collection(db, colName));
                const batch = writeBatch(db);
                snap.docs.forEach(d => batch.delete(d.ref));
                if (snap.docs.length) await batch.commit();
            };
            await Promise.all([purge(scopedPages), purge(scopedTiles)]);
        }

        if (data.pages) {
            localStorage.setItem('pages', JSON.stringify(data.pages));
            if (db) {
                const batch = writeBatch(db);
                data.pages.forEach((p, i) => { if (p.id) batch.set(doc(db, scopedPages, p.id), { ...p, _order: i }); });
                await batch.commit();
            }
        }
        if (data.tiles) {
            localStorage.setItem('tiles', JSON.stringify(data.tiles));
            if (db) {
                const batch = writeBatch(db);
                data.tiles.forEach((t, i) => { if (t.id) batch.set(doc(db, scopedTiles, t.id), { ...t, _order: i }); });
                await batch.commit();
            }
        }
        if (data.settings) {
            localStorage.setItem('settings_config', JSON.stringify(data.settings));
            if (db) await setDoc(doc(db, scopedSettings, 'config'), data.settings);
        }
    }

    async syncFromFirebase(collectionName, id) {
        const scopedCol = this._col(collectionName);
        if (!db) return null;
        try {
            const snap = await getDoc(doc(db, scopedCol, id));
            if (!snap.exists()) return null;
            const freshData = { id: snap.id, ...snap.data() };
            const existingStr = localStorage.getItem(collectionName);
            const existing = existingStr ? JSON.parse(existingStr) : [];
            const idx = existing.findIndex(item => item.id === id);
            if (idx >= 0) existing[idx] = freshData;
            else existing.push(freshData);
            localStorage.setItem(collectionName, JSON.stringify(existing));
            return freshData;
        } catch (e) {
            if (e.code !== 'permission-denied') console.warn('Firebase sync failed:', e);
            return null;
        }
    }

    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export const storage = new Storage();
