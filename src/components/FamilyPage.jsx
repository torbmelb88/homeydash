import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar, ShoppingCart, CheckSquare, Settings, X, Plus,
  Check, Trash2, RefreshCw, ChevronRight,
  Maximize2, Users, Pencil, LayoutGrid,
  Utensils, Shirt, WashingMachine, Wallet
} from 'lucide-react';
import * as calApi from '../services/ha-calendar-api';
import * as todoistApi from '../services/todoist-api';
import { useHomey } from '../context/HomeyContext';
import { storage } from '../services/storage';
import '../styles/family-page.css';

// Credentials and settings stored separately from pages array so they sync
// cross-origin via Firebase (localStorage is per-origin, Firebase is not)
const CREDS_KEY = 'familyCredentials';
const CREDS_ID = 'tokens';
const SETTINGS_KEY = 'familyPageSettings';

async function loadCredentials() {
  return await storage.get(CREDS_KEY, CREDS_ID) || {};
}

async function saveCredentials(creds) {
  await storage.set(CREDS_KEY, creds, CREDS_ID);
}

async function loadPageSettings(pageId) {
  return await storage.get(SETTINGS_KEY, pageId) || {};
}

async function savePageSettings(pageId, settings) {
  await storage.set(SETTINGS_KEY, { ...settings, id: pageId }, pageId);
}

// ─── Norwegian date helpers ────────────────────────────────────────────────

const DAYS_NO = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
const MONTHS_NO = ['januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember'];

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return 'I dag';
  if (d.getTime() === tomorrow.getTime()) return 'I morgen';
  return `${DAYS_NO[d.getDay()]} ${d.getDate()}. ${MONTHS_NO[d.getMonth()]}`;
}

function fmtTime(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

function todayStr() {
  // Lokal dato (toISOString gir UTC og bommer rundt midnatt)
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function groupByDay(events) {
  const groups = {};
  events.forEach(ev => {
    const key = ev.start?.date || ev.start?.dateTime?.split('T')[0];
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(ev);
  });
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

// ─── Calendar section ─────────────────────────────────────────────────────

function CalendarSection({ settings, expanded, events, loading, error, onEventsChange, onRefresh }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEvent, setNewEvent] = useState({ summary: '', date: todayStr(), startTime: '12:00', endTime: '13:00', allDay: false, calendarId: '' });
  const [saving, setSaving] = useState(false);

  const calendarIds = settings?.haCalendarIds || [];

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!newEvent.summary.trim()) return;
    setSaving(true);
    try {
      const calId = newEvent.calendarId || calendarIds[0];
      let start, end;
      if (newEvent.allDay) {
        start = newEvent.date;
        const endDate = new Date(newEvent.date + 'T00:00:00');
        endDate.setDate(endDate.getDate() + 1);
        end = endDate.toISOString().split('T')[0];
      } else {
        start = `${newEvent.date}T${newEvent.startTime}:00`;
        end = `${newEvent.date}T${newEvent.endTime}:00`;
      }
      await calApi.createEvent(calId, {
        summary: newEvent.summary,
        start, end,
        allDay: newEvent.allDay,
      });
      setNewEvent({ summary: '', date: todayStr(), startTime: '12:00', endTime: '13:00', allDay: false, calendarId: '' });
      setShowAddForm(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to create event:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ev) => {
    onEventsChange(prev => prev.filter(e => e.id !== ev.id));
    try {
      await calApi.deleteEvent(ev.calendarId, ev.uid, ev.recurrence_id);
    } catch (err) {
      console.error('Failed to delete event:', err);
      onRefresh();
    }
  };

  if (!calendarIds.length) {
    return (
      <div className="fp-empty">
        <Calendar size={32} opacity={0.3} />
        <p>Kalender ikke konfigurert</p>
      </div>
    );
  }

  // Kompakt kolonne: tettere rader (family-page.css) gjør at flere dager får
  // plass – kolonnen scroller uansett, så grensen er bare et tak mot svært
  // lange lister
  const COMPACT_DAY_LIMIT = 8;
  const grouped = groupByDay(events);
  const displayGroups = expanded ? grouped : grouped.slice(0, COMPACT_DAY_LIMIT);
  const today = todayStr();

  return (
    <div className="fp-calendar-content">
      {loading && <div className="fp-loading"><RefreshCw size={14} className="fp-spin" /> Laster...</div>}
      {error && <div className="fp-error">{error}</div>}

      {expanded && (
        <div className="fp-toolbar">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddForm(v => !v)}>
            <Plus size={14} /> Ny hendelse
          </button>
          <button className="fp-refresh-btn" onClick={onRefresh} title="Oppdater">
            <RefreshCw size={14} />
          </button>
        </div>
      )}

      {expanded && showAddForm && (
        <form className="fp-add-form" onSubmit={handleAddEvent}>
          <input
            className="fp-input"
            type="text"
            placeholder="Tittel på hendelse"
            value={newEvent.summary}
            onChange={e => setNewEvent(p => ({ ...p, summary: e.target.value }))}
            autoFocus
          />
          <div className="fp-add-row">
            <label className="fp-checkbox-label">
              <input type="checkbox" checked={newEvent.allDay}
                onChange={e => setNewEvent(p => ({ ...p, allDay: e.target.checked }))} />
              Hele dagen
            </label>
            <input className="fp-input fp-input-date" type="date" value={newEvent.date}
              onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))} />
          </div>
          {!newEvent.allDay && (
            <div className="fp-add-row">
              <input className="fp-input" type="time" value={newEvent.startTime}
                onChange={e => setNewEvent(p => ({ ...p, startTime: e.target.value }))} />
              <span style={{ color: 'var(--color-text-secondary)' }}>–</span>
              <input className="fp-input" type="time" value={newEvent.endTime}
                onChange={e => setNewEvent(p => ({ ...p, endTime: e.target.value }))} />
            </div>
          )}
          {calendarIds.length > 1 && (
            <FpDropdown
              value={newEvent.calendarId}
              onChange={val => setNewEvent(p => ({ ...p, calendarId: val }))}
              placeholder="Velg kalender"
              options={[
                { value: '', label: 'Velg kalender' },
                ...calendarIds.map(id => ({ value: id, label: calApi.getCalendarName(id) }))
              ]}
            />
          )}
          <div className="fp-add-row">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Lagrer...' : 'Lagre'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddForm(false)}>
              Avbryt
            </button>
          </div>
        </form>
      )}

      {displayGroups.length === 0 && !loading && (
        <div className="fp-empty" style={{ padding: '24px' }}>
          <p>Ingen kommende hendelser</p>
        </div>
      )}

      {displayGroups.map(([dateStr, dayEvents]) => (
        <div key={dateStr} className={`fp-day-group${dateStr === today ? ' today' : ''}`}>
          <div className="fp-day-label">{dayLabel(dateStr)}</div>
          {dayEvents.map(ev => (
            <div key={ev.id} className={`fp-event${dateStr === today ? ' today' : ''}`}>
              <div className="fp-event-time">
                {ev.start?.dateTime ? fmtTime(ev.start.dateTime) : 'Hele dagen'}
              </div>
              <div className="fp-event-title">{ev.summary}</div>
              {expanded && (
                <button className="fp-delete-btn" onClick={() => handleDelete(ev)} title="Slett">
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      {!expanded && grouped.length > COMPACT_DAY_LIMIT && (
        <div className="fp-more-hint">+{grouped.length - COMPACT_DAY_LIMIT} dager til</div>
      )}
    </div>
  );
}

// ─── Todo section ─────────────────────────────────────────────────────────

const RECURRENCE_OPTIONS = [
  { label: 'Ingen gjentakelse', value: '' },
  { label: 'Hver dag', value: 'every day' },
  { label: 'Hverdager (man–fre)', value: 'every weekday' },
  { label: 'Annenhver dag', value: 'every 2 days' },
  { label: 'Hver uke', value: 'every week' },
  { label: 'Annenhver uke', value: 'every 2 weeks' },
  { label: 'Hver måned', value: 'every month' },
  { label: 'Spesifikke dager…', value: '__days__' },
];

const WEEKDAYS = [
  { short: 'Ma', long: 'monday' },
  { short: 'Ti', long: 'tuesday' },
  { short: 'On', long: 'wednesday' },
  { short: 'To', long: 'thursday' },
  { short: 'Fr', long: 'friday' },
  { short: 'Lø', long: 'saturday' },
  { short: 'Sø', long: 'sunday' },
];

function FpDropdown({ value, onChange, options, placeholder = 'Velg...' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="fp-input fp-select"
        style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ opacity: selected ? 1 : 0.5 }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ opacity: 0.5, fontSize: '0.8em' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="fp-dd-pop">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              className={`fp-dd-opt ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RecurrencePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const isDays = value?.startsWith('every ') && WEEKDAYS.some(d => value.includes(d.long));
  const selected = isDays ? '__days__' : (RECURRENCE_OPTIONS.find(o => o.value === value) ? value : '');
  const activeDays = isDays ? WEEKDAYS.filter(d => value.includes(d.long)).map(d => d.long) : [];
  const label = isDays
    ? activeDays.map(d => WEEKDAYS.find(w => w.long === d)?.short).join(', ')
    : (RECURRENCE_OPTIONS.find(o => o.value === value)?.label ?? (value || 'Ingen gjentakelse'));

  const handleSelect = (val) => {
    setOpen(false);
    if (val === '__days__') { onChange('every monday'); return; }
    onChange(val);
  };

  const toggleDay = (day) => {
    const next = activeDays.includes(day)
      ? activeDays.filter(d => d !== day)
      : [...activeDays, WEEKDAYS.find(w => w.long === day).long];
    if (next.length === 0) { onChange(''); return; }
    onChange('every ' + next.join(', '));
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="fp-input fp-select"
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ opacity: value ? 1 : 0.5 }}>{label}</span>
        <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', opacity: 0.5, transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div className="fp-dd-pop">
          {RECURRENCE_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              className={`fp-dd-opt ${selected === o.value ? 'active' : ''}`}
              onClick={() => handleSelect(o.value)}
            >{o.label}</button>
          ))}
        </div>
      )}

      {selected === '__days__' && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {WEEKDAYS.map(d => (
            <button
              key={d.long}
              type="button"
              className={`fp-day-btn ${activeDays.includes(d.long) ? 'active' : ''}`}
              onClick={() => toggleDay(d.long)}
            >{d.short}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const PRIORITY_OPTIONS = [
  { value: 4, label: 'P1', color: '#db4035' },
  { value: 3, label: 'P2', color: '#ff8c00' },
  { value: 2, label: 'P3', color: '#246fe0' },
  { value: 1, label: 'P4', color: '#666' },
];

function PriorityPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {PRIORITY_OPTIONS.map(p => (
        <button
          key={p.value}
          type="button"
          className="fp-prio-btn"
          onClick={() => onChange(value === p.value ? 1 : p.value)}
          title={p.label}
          style={value === p.value ? { borderColor: p.color, background: p.color + '22', color: p.color } : {}}
        >{p.label}</button>
      ))}
    </div>
  );
}

function TodoSection({ settings, expanded, tasks, sections = [], loading, error, onTasksChange, onRefresh }) {
  const [newContent, setNewContent] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newPriority, setNewPriority] = useState(1);
  const [newSection, setNewSection] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingDate, setEditingDate] = useState('');
  const [editingOriginalDate, setEditingOriginalDate] = useState('');
  const [editingDue, setEditingDue] = useState('');
  const [editingOriginalDue, setEditingOriginalDue] = useState('');
  const [editingPriority, setEditingPriority] = useState(1);
  const [editingSection, setEditingSection] = useState('');
  const [editingOriginalSection, setEditingOriginalSection] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [extraSections, setExtraSections] = useState([]);
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionSaving, setNewSectionSaving] = useState(false);

  const hasToken = !!todoistApi.getStoredToken();

  const projectId = settings?.todoProjectId || null;

  // Layout for kategorier (stablet / kolonner / tett pakket) — leses her fordi hooken under trenger den
  const layout = settings?.todoLayout || 'stacked';

  // «Automatisk» kolonneantall for tett pakking: bredde / 240 px (samme minimum som «Side om side»).
  // NB: hooks må ligge FØR den tidlige `if (!hasToken) return` lenger ned (React error #310).
  const packedRef = useRef(null);
  const [autoColCount, setAutoColCount] = useState(2);
  useEffect(() => {
    if (layout !== 'packed') return;
    const el = packedRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setAutoColCount(Math.max(1, Math.floor(el.clientWidth / 240)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout]);

  // Samle en oppgave + alle dens etterkommere (Todoist lukker/sletter subtasks med forelderen)
  const collectWithDescendants = (taskId, list) => {
    const ids = new Set([taskId]);
    let added = true;
    while (added) {
      added = false;
      for (const t of list) {
        if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) {
          ids.add(t.id);
          added = true;
        }
      }
    }
    return ids;
  };

  const handleComplete = async (taskId) => {
    onTasksChange(prev => {
      const ids = collectWithDescendants(taskId, prev);
      return prev.filter(t => !ids.has(t.id));
    });
    try {
      await todoistApi.closeTask(taskId);
    } catch (e) {
      onRefresh();
    }
  };

  const handleDelete = async (taskId) => {
    onTasksChange(prev => {
      const ids = collectWithDescendants(taskId, prev);
      return prev.filter(t => !ids.has(t.id));
    });
    try {
      await todoistApi.deleteTask(taskId);
    } catch (e) {
      onRefresh();
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setSaving(true);
    try {
      // Gjentakelse + startdato kombineres: «every week starting 2026-07-29»
      // – ellers ignorerer Todoist datoen og starter gjentakelsen i dag
      const due = newDue.trim();
      const task = await todoistApi.createTask({
        content: newContent.trim(),
        projectId: projectId || undefined,
        sectionId: newSection || undefined,
        dueString: due ? (newDate ? `${due} starting ${newDate}` : due) : undefined,
        dueDate: !due && newDate ? newDate : undefined,
        dueLang: 'en',
        priority: newPriority,
      });
      onTasksChange(prev => [...prev, task]);
      setNewContent('');
      setNewDue('');
      setNewDate('');
      setNewPriority(1);
    } catch (e) {
      console.error('Failed to create task:', e);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (task) => {
    const sec = task.section_id ? String(task.section_id) : '';
    const date = task.due?.date || '';
    // Strippe «starting <dato>»-suffix så pickeren gjenkjenner grunnmønsteret
    // (datoen ligger allerede i date-feltet) og lagring ikke dobler suffixet
    const due = task.due?.is_recurring
      ? (task.due.string || '').replace(/\s+starting\s+.*$/i, '')
      : '';
    setEditingId(task.id);
    setEditingContent(task.content);
    setEditingDate(date);
    setEditingOriginalDate(date);
    setEditingDue(due);
    setEditingOriginalDue(due);
    setEditingPriority(task.priority || 1);
    setEditingSection(sec);
    setEditingOriginalSection(sec);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
    setEditingDate('');
    setEditingOriginalDate('');
    setEditingDue('');
    setEditingOriginalDue('');
    setEditingPriority(1);
    setEditingSection('');
    setEditingOriginalSection('');
  };

  const saveEdit = async (taskId) => {
    if (!editingContent.trim()) return;
    setEditSaving(true);
    try {
      const updates = { content: editingContent.trim(), priority: editingPriority };
      // Send due-felt kun ved faktisk endring – ellers slettes gjentakelse på uendrede oppgaver
      const dueChanged = editingDue !== editingOriginalDue || editingDate !== editingOriginalDate;
      if (dueChanged) {
        if (editingDue) {
          // Gjentakelse + dato kombineres («every week starting 2026-07-29»)
          // – ellers ignorerer Todoist datoen og starter gjentakelsen i dag
          updates.due_string = editingDate ? `${editingDue} starting ${editingDate}` : editingDue;
          updates.due_lang = 'en';
        }
        else if (editingDate) updates.due_date = editingDate;
        else updates.due_string = 'no due date';
      }
      const sectionChanged = editingSection !== editingOriginalSection && editingSection;
      const [updated] = await Promise.all([
        todoistApi.updateTask(taskId, updates),
        sectionChanged ? todoistApi.moveTaskToSection(taskId, editingSection).catch(e => console.warn('Section move failed:', e)) : Promise.resolve(),
      ]);
      onTasksChange(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        const next = { ...t, ...(updated || {}), content: editingContent.trim(), priority: editingPriority, section_id: editingSection || t.section_id };
        if (!updated && dueChanged) {
          next.due = editingDue
            ? { string: editingDue, is_recurring: true, date: editingDate || t.due?.date }
            : (editingDate ? { date: editingDate } : null);
        }
        return next;
      }));
      cancelEdit();
    } catch (e) {
      console.error('Failed to update task:', e);
    } finally {
      setEditSaving(false);
    }
  };

  const createNewSection = async () => {
    if (!newSectionName.trim() || !projectId) return;
    setNewSectionSaving(true);
    try {
      const sec = await todoistApi.createSection(projectId, newSectionName.trim());
      setExtraSections(prev => [...prev, sec]);
      setNewSection(String(sec.id));
      setNewSectionName('');
      setShowNewSection(false);
      onRefresh();
    } catch (e) {
      console.error('Failed to create section:', e);
    } finally {
      setNewSectionSaving(false);
    }
  };

  if (!hasToken) {
    return (
      <div className="fp-empty">
        <CheckSquare size={32} opacity={0.3} />
        <p>Todoist ikke konfigurert</p>
      </div>
    );
  }

  const today = todayStr();
  const byOrder = (a, b) => (a.child_order ?? a.order ?? 0) - (b.child_order ?? b.order ?? 0);

  // Bygg foreldre→barn-tre. Oppgaver med parent_id utenfor settet behandles som rot.
  const taskIds = new Set(tasks.map(t => t.id));
  const childrenByParent = {};
  tasks.forEach(t => {
    const key = (t.parent_id && taskIds.has(t.parent_id)) ? t.parent_id : 'root';
    (childrenByParent[key] ||= []).push(t);
  });

  const roots = [...(childrenByParent['root'] || [])].sort((a, b) => {
    const aD = a.due?.date || '9999';
    const bD = b.due?.date || '9999';
    if (aD !== bD) return aD.localeCompare(bD);
    return byOrder(a, b);
  });

  const visibleRoots = roots;

  // Oppgaver med frist i dag (eller forfalt) vises øverst i sin kategori,
  // adskilt fra senere oppgaver med en skillelinje
  const isDueNow = (t) => t.due?.date && t.due.date <= today;

  // Én oppgaverad (med subtasks under, rekursivt). Returnerer en flat liste av elementer.
  const renderRows = (rootList) => {
    const out = [];
    const walk = (task, depth) => {
      const overdue = task.due?.date && task.due.date < today;
      const dueToday = task.due?.date === today;
      const priorityColor = PRIORITY_OPTIONS.find(p => p.value === task.priority)?.color;
      const hasChildren = !!childrenByParent[task.id]?.length;

      if (editingId === task.id) {
        out.push(
          <div
            key={task.id}
            className={`fp-task ${depth > 0 ? 'fp-subtask' : ''}`}
            style={{ flexWrap: 'wrap', gap: 4, alignItems: 'flex-start', paddingRight: 4, ...(depth > 0 ? { marginLeft: depth * 26 } : {}) }}
          >
            <div className="fp-task-body" style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                className="fp-input"
                type="text"
                value={editingContent}
                onChange={e => setEditingContent(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(task.id); if (e.key === 'Escape') cancelEdit(); }}
                autoFocus
              />
              <div className="fp-add-row">
                <input
                  className="fp-input"
                  type="date"
                  value={editingDate}
                  onChange={e => setEditingDate(e.target.value)}
                  style={{ flex: 1 }}
                />
                <PriorityPicker value={editingPriority} onChange={setEditingPriority} />
              </div>
              <RecurrencePicker value={editingDue} onChange={setEditingDue} />
              {projectId && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="fp-add-row">
                    <select className="fp-input" value={editingSection} onChange={e => setEditingSection(e.target.value)} style={{ flex: 1 }}>
                      <option value="">Ingen kategori</option>
                      {sortedSections.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                    </select>
                    <button type="button" className="fp-delete-btn" onClick={() => setShowNewSection(v => !v)} title="Ny kategori" style={{ color: showNewSection ? 'var(--color-primary, #2563eb)' : undefined }}>
                      <Plus size={13} />
                    </button>
                  </div>
                  {showNewSection && (
                    <div className="fp-add-row">
                      <input className="fp-input" type="text" placeholder="Kategorinavn..." value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createNewSection(); } if (e.key === 'Escape') { setShowNewSection(false); setNewSectionName(''); } }}
                        autoFocus style={{ flex: 1 }} />
                      <button type="button" className="btn btn-primary btn-sm" onClick={createNewSection} disabled={newSectionSaving} style={{ padding: '4px 10px' }}><Check size={13} /></button>
                      <button type="button" className="fp-delete-btn" onClick={() => { setShowNewSection(false); setNewSectionName(''); }}><X size={13} /></button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              <button className="btn btn-primary btn-sm" onClick={() => saveEdit(task.id)} disabled={editSaving} style={{ padding: '4px 10px' }}>
                <Check size={13} />
              </button>
              <button className="fp-delete-btn" onClick={cancelEdit} title="Avbryt">
                <X size={13} />
              </button>
            </div>
          </div>
        );
      } else {
        out.push(
          <div
            key={task.id}
            className={`fp-task ${overdue ? 'fp-task--overdue' : ''} ${depth > 0 ? 'fp-subtask' : ''}`}
            style={depth > 0 ? { marginLeft: depth * 26 } : undefined}
          >
            <button
              className="fp-task-check"
              onClick={() => handleComplete(task.id)}
              title="Fullfør"
              style={priorityColor && task.priority > 1 ? { borderColor: priorityColor } : {}}
            >
              <Check size={14} />
            </button>
            <div className="fp-task-body">
              <span className="fp-task-title">{task.content}</span>
              <div className="fp-task-meta">
                {task.due && (
                  <span className={`fp-task-due ${overdue ? 'overdue' : dueToday ? 'today' : ''}`}>
                    {task.due.is_recurring && (
                      <RefreshCw size={10} style={{ marginRight: 3, opacity: 0.6, display: 'inline', verticalAlign: 'middle' }} />
                    )}
                    {task.due.date
                      ? (dueToday ? 'I dag' : overdue ? `Forfalt ${dayLabel(task.due.date)}` : dayLabel(task.due.date))
                      : task.due.string}
                  </span>
                )}
                {hasChildren && (
                  <span className="fp-subtask-count">{childrenByParent[task.id].length} deloppgaver</span>
                )}
                {(task.labels || []).map(label => (
                  <span key={label} className="fp-label-chip">{label}</span>
                ))}
              </div>
            </div>
            {expanded && (
              <>
                <button className="fp-delete-btn" onClick={() => startEdit(task)} title="Rediger" style={{ marginRight: 2 }}>
                  <Pencil size={12} />
                </button>
                <button className="fp-delete-btn" onClick={() => handleDelete(task.id)} title="Slett">
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        );
      }
      (childrenByParent[task.id] || []).slice().sort(byOrder).forEach(c => walk(c, depth + 1));
    };
    rootList.forEach(r => walk(r, 0));
    return out;
  };

  // Rendrer en liste med dagens/forfalte oppgaver øverst og skillelinje ned
  // til senere oppgaver (brukes både flat og per kategori)
  const renderSplitRows = (list) => {
    const now = list.filter(isDueNow);
    const later = list.filter(t => !isDueNow(t));
    return (
      <React.Fragment>
        {renderRows(now)}
        {now.length > 0 && later.length > 0 && <div className="fp-today-divider" />}
        {renderRows(later)}
      </React.Fragment>
    );
  };

  // Grupper rot-oppgaver etter Todoist-seksjon (kategori). Uten seksjon = øverst, uten overskrift.

  const allSections = [...sections, ...extraSections.filter(e => !sections.some(s => s.id === e.id))];
  const sortedSections = allSections.sort(
    (a, b) => (a.section_order ?? a.order ?? 0) - (b.section_order ?? b.order ?? 0)
  );
  const rootsBySection = {};
  visibleRoots.forEach(t => {
    const key = (t.section_id && sortedSections.some(s => String(s.id) === String(t.section_id)))
      ? String(t.section_id) : '__none';
    (rootsBySection[key] ||= []).push(t);
  });

  const groups = [];
  if (rootsBySection['__none']?.length) {
    groups.push({ id: '__none', name: null, roots: rootsBySection['__none'] });
  }
  sortedSections.forEach(s => {
    if (rootsBySection[String(s.id)]?.length) {
      groups.push({ id: String(s.id), name: s.name, roots: rootsBySection[String(s.id)] });
    }
  });

  // Grupper kun når det finnes minst én navngitt seksjon med oppgaver
  const useGroups = groups.some(g => g.name);

  return (
    <div className="fp-list-content" ref={packedRef}>
      {loading && <div className="fp-loading"><RefreshCw size={14} className="fp-spin" /> Laster...</div>}
      {error && <div className="fp-error">{error}</div>}

      {expanded && (
        <form className="fp-add-form" onSubmit={handleAdd}>
          <input
            className="fp-input"
            type="text"
            placeholder="Ny oppgave..."
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            autoFocus
          />
          <div className="fp-add-row">
            <input
              className="fp-input"
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              style={{ flex: 1 }}
            />
            <PriorityPicker value={newPriority} onChange={setNewPriority} />
          </div>
          <div className="fp-add-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <RecurrencePicker value={newDue} onChange={setNewDue} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ marginTop: 1 }}>
              <Plus size={14} />
            </button>
          </div>
          {projectId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="fp-add-row">
                <select className="fp-input" value={newSection} onChange={e => setNewSection(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Ingen kategori</option>
                  {sortedSections.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
                <button type="button" className="fp-delete-btn" onClick={() => setShowNewSection(v => !v)} title="Ny kategori" style={{ color: showNewSection ? 'var(--color-primary, #2563eb)' : undefined }}>
                  <Plus size={13} />
                </button>
              </div>
              {showNewSection && (
                <div className="fp-add-row">
                  <input className="fp-input" type="text" placeholder="Kategorinavn..." value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createNewSection(); } if (e.key === 'Escape') { setShowNewSection(false); setNewSectionName(''); } }}
                    autoFocus style={{ flex: 1 }} />
                  <button type="button" className="btn btn-primary btn-sm" onClick={createNewSection} disabled={newSectionSaving} style={{ padding: '4px 10px' }}><Check size={13} /></button>
                  <button type="button" className="fp-delete-btn" onClick={() => { setShowNewSection(false); setNewSectionName(''); }}><X size={13} /></button>
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {roots.length === 0 && !loading && (
        <div className="fp-empty" style={{ padding: '24px' }}>
          <p>Ingen oppgaver</p>
        </div>
      )}

      {!useGroups && renderSplitRows(visibleRoots)}

      {useGroups && layout === 'packed' && (() => {
        // Tett pakking: hver kategori legges i den kolonnen som til nå er lavest
        // (største først), så lange kategorier får egen kolonne og de korte stables.
        // Innenfor hver kolonne beholdes seksjonsrekkefølgen fra Todoist.
        const countRows = (list) => list.reduce(
          (n, t) => n + 1 + countRows(childrenByParent[t.id] || []), 0
        );
        const colCount = Math.max(1, Math.min(groups.length, Number(settings?.todoColumnsCount) || autoColCount));
        const columns = Array.from({ length: colCount }, () => ({ height: 0, groups: [] }));
        groups
          .map((g, order) => ({ g, order, height: countRows(g.roots) + (g.name ? 1 : 0) }))
          .sort((a, b) => b.height - a.height || a.order - b.order)
          .forEach(item => {
            const col = columns.reduce((best, c) => (c.height < best.height ? c : best), columns[0]);
            col.groups.push(item);
            col.height += item.height;
          });
        return (
          <div className="fp-todo-packed">
            {columns.map((col, i) => (
              <div key={i} className="fp-todo-packed-col">
                {col.groups.sort((a, b) => a.order - b.order).map(({ g }) => (
                  <div key={g.id} className="fp-todo-group">
                    {g.name && <div className="fp-todo-group-label">{g.name}</div>}
                    {renderSplitRows(g.roots)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {useGroups && layout !== 'packed' && (() => {
        const colCount = layout === 'columns' ? Number(settings?.todoColumnsCount) || 0 : 0;
        return (
          <div
            className={layout === 'columns' ? 'fp-todo-columns' : 'fp-todo-stacked'}
            style={colCount ? { display: 'grid', gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` } : undefined}
          >
            {groups.map((group, i) => (
              <div
                key={group.id}
                className="fp-todo-group"
                style={colCount ? (i % colCount === 0
                  ? { minWidth: 0, borderLeft: 'none', paddingLeft: 0 }
                  : { minWidth: 0, borderLeft: '2px solid var(--wb-pencil-line)', paddingLeft: 14 }) : undefined}
              >
                {group.name && <div className="fp-todo-group-label">{group.name}</div>}
                {renderSplitRows(group.roots)}
              </div>
            ))}
          </div>
        );
      })()}

      {roots.some(t => t.priority > 1) && (
        <div className="fp-prio-legend">
          <span className="fp-prio-legend-title">Prioritet:</span>
          {[
            { color: '#db4035', text: 'Høy' },
            { color: '#ff8c00', text: 'Middels' },
            { color: '#246fe0', text: 'Lav' },
          ].map(p => (
            <span key={p.text} className="fp-prio-legend-item">
              <span className="fp-prio-legend-ring" style={{ borderColor: p.color }} />
              {p.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shopping section ────────────────────────────────────────────────────

function ShoppingSection({ settings, expanded, items, sections = [], loading, error, onItemsChange, onRefresh }) {
  const [newItem, setNewItem] = useState('');
  const [newSection, setNewSection] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingSection, setEditingSection] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [extraSections, setExtraSections] = useState([]);
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionSaving, setNewSectionSaving] = useState(false);

  const projectId = settings?.shoppingProjectId || null;
  const hasToken = !!todoistApi.getStoredToken();

  const handleCheck = async (itemId) => {
    onItemsChange(prev => prev.filter(t => t.id !== itemId));
    try {
      await todoistApi.closeTask(itemId);
    } catch (e) {
      onRefresh();
    }
  };

  const handleDelete = async (itemId) => {
    onItemsChange(prev => prev.filter(t => t.id !== itemId));
    try {
      await todoistApi.deleteTask(itemId);
    } catch (e) {
      onRefresh();
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    setSaving(true);
    try {
      const task = await todoistApi.createTask({
        content: newItem.trim(),
        projectId: projectId || undefined,
        sectionId: newSection || undefined,
      });
      onItemsChange(prev => [...prev, task]);
      setNewItem('');
    } catch (e) {
      console.error('Failed to add item:', e);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditingContent(item.content);
    setEditingSection(item.section_id ? String(item.section_id) : '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
    setEditingSection('');
  };

  const saveEdit = async (itemId) => {
    if (!editingContent.trim()) return;
    setEditSaving(true);
    try {
      const [updated] = await Promise.all([
        todoistApi.updateTask(itemId, { content: editingContent.trim() }),
        editingSection ? todoistApi.moveTaskToSection(itemId, editingSection) : Promise.resolve(),
      ]);
      onItemsChange(prev => prev.map(t => t.id === itemId ? { ...t, ...(updated || {}), content: editingContent.trim(), section_id: editingSection || t.section_id } : t));
      cancelEdit();
    } catch (e) {
      console.error('Failed to update item:', e);
    } finally {
      setEditSaving(false);
    }
  };

  const createNewSection = async () => {
    if (!newSectionName.trim() || !projectId) return;
    setNewSectionSaving(true);
    try {
      const sec = await todoistApi.createSection(projectId, newSectionName.trim());
      setExtraSections(prev => [...prev, sec]);
      setNewSection(String(sec.id));
      setNewSectionName('');
      setShowNewSection(false);
      onRefresh();
    } catch (e) {
      console.error('Failed to create section:', e);
    } finally {
      setNewSectionSaving(false);
    }
  };

  if (!hasToken || !projectId) {
    return (
      <div className="fp-empty">
        <ShoppingCart size={32} opacity={0.3} />
        <p>{!hasToken ? 'Todoist ikke konfigurert' : 'Handleliste-prosjekt ikke valgt'}</p>
      </div>
    );
  }

  const allSections = [...sections, ...extraSections.filter(e => !sections.some(s => s.id === e.id))];
  const sortedSections = allSections.sort(
    (a, b) => (a.section_order ?? a.order ?? 0) - (b.section_order ?? b.order ?? 0)
  );

  const displayItems = items;

  const itemsBySection = {};
  displayItems.forEach(item => {
    const key = (item.section_id && sortedSections.some(s => String(s.id) === String(item.section_id)))
      ? String(item.section_id) : '__none';
    (itemsBySection[key] ||= []).push(item);
  });

  const groups = [];
  if (itemsBySection['__none']?.length) groups.push({ id: '__none', name: null, items: itemsBySection['__none'] });
  sortedSections.forEach(s => {
    if (itemsBySection[String(s.id)]?.length) groups.push({ id: String(s.id), name: s.name, items: itemsBySection[String(s.id)] });
  });
  const useGroups = groups.some(g => g.name);

  const renderItem = (item) => {
    if (editingId === item.id) {
      return (
        <div key={item.id} className="fp-task" style={{ flexWrap: 'wrap', gap: 4, alignItems: 'flex-start', paddingRight: 4 }}>
          <div className="fp-task-body" style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input
              className="fp-input"
              type="text"
              value={editingContent}
              onChange={e => setEditingContent(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(item.id); if (e.key === 'Escape') cancelEdit(); }}
              autoFocus
            />
            {projectId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="fp-add-row">
                  <select className="fp-input" value={editingSection} onChange={e => setEditingSection(e.target.value)} style={{ flex: 1 }}>
                    <option value="">Ingen kategori</option>
                    {sortedSections.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
                  <button type="button" className="fp-delete-btn" onClick={() => setShowNewSection(v => !v)} title="Ny kategori" style={{ color: showNewSection ? 'var(--color-primary, #2563eb)' : undefined }}>
                    <Plus size={13} />
                  </button>
                </div>
                {showNewSection && (
                  <div className="fp-add-row">
                    <input className="fp-input" type="text" placeholder="Kategorinavn..." value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createNewSection(); } if (e.key === 'Escape') { setShowNewSection(false); setNewSectionName(''); } }}
                      autoFocus style={{ flex: 1 }} />
                    <button type="button" className="btn btn-primary btn-sm" onClick={createNewSection} disabled={newSectionSaving} style={{ padding: '4px 10px' }}><Check size={13} /></button>
                    <button type="button" className="fp-delete-btn" onClick={() => { setShowNewSection(false); setNewSectionName(''); }}><X size={13} /></button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            <button className="btn btn-primary btn-sm" onClick={() => saveEdit(item.id)} disabled={editSaving} style={{ padding: '4px 10px' }}>
              <Check size={13} />
            </button>
            <button className="fp-delete-btn" onClick={cancelEdit} title="Avbryt">
              <X size={13} />
            </button>
          </div>
        </div>
      );
    }
    return (
      <div key={item.id} className="fp-task">
        <button className="fp-task-check" onClick={() => handleCheck(item.id)} title="Handlet">
          <Check size={14} />
        </button>
        <div className="fp-task-body">
          <span className="fp-task-title">{item.content}</span>
        </div>
        {expanded && (
          <>
            <button className="fp-delete-btn" onClick={() => startEdit(item)} title="Rediger" style={{ marginRight: 2 }}>
              <Pencil size={12} />
            </button>
            <button className="fp-delete-btn" onClick={() => handleDelete(item.id)} title="Slett">
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="fp-list-content">
      {loading && <div className="fp-loading"><RefreshCw size={14} className="fp-spin" /> Laster...</div>}
      {error && <div className="fp-error">{error}</div>}

      {expanded && (
        <form className="fp-add-form" onSubmit={handleAdd}>
          <div className="fp-add-row">
            <input
              className="fp-input"
              type="text"
              placeholder="Legg til vare..."
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              <Plus size={14} />
            </button>
          </div>
          {projectId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              <div className="fp-add-row">
                <select className="fp-input" value={newSection} onChange={e => setNewSection(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Ingen kategori</option>
                  {sortedSections.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
                <button type="button" className="fp-delete-btn" onClick={() => setShowNewSection(v => !v)} title="Ny kategori" style={{ color: showNewSection ? 'var(--color-primary, #2563eb)' : undefined }}>
                  <Plus size={13} />
                </button>
              </div>
              {showNewSection && (
                <div className="fp-add-row">
                  <input className="fp-input" type="text" placeholder="Kategorinavn..." value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createNewSection(); } if (e.key === 'Escape') { setShowNewSection(false); setNewSectionName(''); } }}
                    autoFocus style={{ flex: 1 }} />
                  <button type="button" className="btn btn-primary btn-sm" onClick={createNewSection} disabled={newSectionSaving} style={{ padding: '4px 10px' }}><Check size={13} /></button>
                  <button type="button" className="fp-delete-btn" onClick={() => { setShowNewSection(false); setNewSectionName(''); }}><X size={13} /></button>
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {displayItems.length === 0 && !loading && (
        <div className="fp-empty" style={{ padding: '24px' }}>
          <p>Handlelisten er tom</p>
        </div>
      )}

      {!useGroups && displayItems.map(renderItem)}

      {useGroups && (
        <div className="fp-todo-stacked">
          {groups.map(group => (
            <div key={group.id} className="fp-todo-group">
              {group.name && <div className="fp-todo-group-label">{group.name}</div>}
              {group.items.map(renderItem)}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// ─── Settings modal ──────────────────────────────────────────────────────

function FamilySettingsModal({ page, onClose, onSave }) {
  const { devices } = useHomey();
  const fs = page.familySettings || {};
  const [tab, setTab] = useState('calendar');
  const [calendarIds, setCalendarIds] = useState(fs.haCalendarIds || []);
  // null = ikke lagret valg ennå → alle sensorer vises (også fremtidige)
  const [economySensorIds, setEconomySensorIds] = useState(fs.economySensorIds ?? null);
  const [todoProjectId, setTodoProjectId] = useState(fs.todoProjectId || '');
  const [shoppingProjectId, setShoppingProjectId] = useState(fs.shoppingProjectId || '');
  const [showShopping, setShowShopping] = useState(fs.showShopping || false);
  const [todoLayout, setTodoLayout] = useState(fs.todoLayout || 'stacked');
  const [todoColumnsCount, setTodoColumnsCount] = useState(fs.todoColumnsCount || '');
  const [sectionWidths, setSectionWidths] = useState({ todo: 1, calendar: 1.4, shopping: 1, ...fs.sectionWidths });
  const [calendarDaysAhead, setCalendarDaysAhead] = useState(String(fs.calendarDaysAhead || 14));
  const [todoistToken, setTodoistToken] = useState(fs.todoistToken || todoistApi.getStoredToken() || '');
  const [calendarList, setCalendarList] = useState([]);
  const [projectList, setProjectList] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [calError, setCalError] = useState('');
  const [projectError, setProjectError] = useState('');

  useEffect(() => {
    if (!calApi.isConnected()) {
      setCalError('Ikke koblet til Home Assistant');
      return;
    }
    const cals = calApi.listCalendars();
    setCalendarList(cals);
    if (!cals.length) {
      setCalError('Fant ingen kalendere i Home Assistant. Sjekk at Google Calendar-integrasjonen er satt opp.');
    }
  }, []);

  useEffect(() => {
    const token = todoistApi.getStoredToken() || (fs.todoistToken || '').trim();
    if (token) {
      if (!todoistApi.getStoredToken()) todoistApi.setToken(token);
      fetchProjects();
    }
  }, []);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    setProjectError('');
    try {
      const projects = await todoistApi.getProjects();
      setProjectList(projects || []);
    } catch (e) {
      setProjectError(e.message === 'INVALID_TOKEN' ? 'Ugyldig token' : 'Kunne ikke hente prosjekter: ' + e.message);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleTodoistTokenTest = async () => {
    if (!todoistToken.trim()) return;
    todoistApi.setToken(todoistToken.trim());
    await fetchProjects();
  };

  const handleTodoistDisconnect = () => {
    todoistApi.clearToken();
    setTodoistToken('');
    setProjectList([]);
  };

  const toggleCalendar = (id) => {
    setCalendarIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const economySensors = getEconomySensors(devices);

  const toggleEconomySensor = (id) => {
    setEconomySensorIds(prev => {
      // Første avhuking materialiserer «alle»-standarden til en eksplisitt liste
      const list = prev ?? economySensors.map(s => s.id);
      return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    });
  };

  const handleSave = () => {
    onSave({
      haCalendarIds: calendarIds,
      todoProjectId,
      shoppingProjectId,
      showShopping,
      todoLayout,
      todoColumnsCount,
      sectionWidths,
      calendarDaysAhead: Number(calendarDaysAhead) || 14,
      economySensorIds,
      // Token passed separately so handleSaveSettings can route it to credentials storage
      todoistToken: todoistToken.trim() || undefined,
    });
    onClose();
  };

  return createPortal(
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: 520, display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>Familiesideinnstillinger</h2>
          <button className="icon-btn close-modal" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="fp-settings-tabs">
          <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>
            <Calendar size={14} /> Kalender
          </button>
          <button className={tab === 'lists' ? 'active' : ''} onClick={() => setTab('lists')}>
            <CheckSquare size={14} /> Lister
          </button>
          <button className={tab === 'economy' ? 'active' : ''} onClick={() => setTab('economy')}>
            <Wallet size={14} /> Økonomi
          </button>
          <button className={tab === 'layout' ? 'active' : ''} onClick={() => setTab('layout')}>
            <LayoutGrid size={14} /> Layout
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>

          {tab === 'calendar' && (
            <div>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                Kalendere hentes fra Home Assistant. Nye kalendere legges til via
                Google Calendar-integrasjonen i HA.
              </p>

              {calError && <div className="fp-error" style={{ marginBottom: 12 }}>{calError}</div>}

              {calendarList.length > 0 && (
                <div className="form-group">
                  <label>Velg kalendere som skal vises</label>
                  {calendarList.map(cal => (
                    <label key={cal.id} className="fp-checkbox-label" style={{ marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={calendarIds.includes(cal.id)}
                        onChange={() => toggleCalendar(cal.id)}
                      />
                      {cal.summary}
                      <span style={{ opacity: 0.4, fontSize: '0.78em', marginLeft: 6, fontFamily: 'monospace' }}>
                        {cal.id}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="form-group">
                <label>Hvor langt frem hendelser vises</label>
                <FpDropdown
                  value={calendarDaysAhead}
                  onChange={setCalendarDaysAhead}
                  options={[
                    { value: '7', label: '1 uke' },
                    { value: '14', label: '2 uker' },
                    { value: '30', label: '1 måned' },
                    { value: '60', label: '2 måneder' },
                    { value: '90', label: '3 måneder' },
                    { value: '180', label: '6 måneder' },
                  ]}
                />
              </div>
            </div>
          )}

          {tab === 'lists' && (
            <div>
              <div className="form-group">
                <label>Todoist API-token</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="fp-input"
                    type="password"
                    value={todoistToken}
                    onChange={e => setTodoistToken(e.target.value)}
                    placeholder="Din Todoist API-token"
                    style={{ flex: 1, fontFamily: 'monospace' }}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={handleTodoistTokenTest}>
                    Test
                  </button>
                  {todoistToken && (
                    <button className="btn btn-danger btn-sm" onClick={handleTodoistDisconnect}>
                      Fjern
                    </button>
                  )}
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  Finn token under Todoist → Innstillinger → Integrasjoner → API-token
                </p>
              </div>

              <div className="form-group">
                <label className="fp-checkbox-label">
                  <input
                    type="checkbox"
                    checked={showShopping}
                    onChange={e => setShowShopping(e.target.checked)}
                  />
                  Vis handleliste-kolonnen
                </label>
              </div>

              {projectList.length > 0 && (
                <>
                  <div className="form-group">
                    <label>Huskeliste-prosjekt</label>
                    <FpDropdown
                      value={todoProjectId}
                      onChange={setTodoProjectId}
                      placeholder="Ingen (vis alle oppgaver)"
                      options={[
                        { value: '', label: 'Ingen (vis alle oppgaver)' },
                        ...projectList.map(p => ({ value: p.id, label: p.name }))
                      ]}
                    />
                  </div>
                  <div className="form-group">
                    <label>Handleliste-prosjekt</label>
                    <FpDropdown
                      value={shoppingProjectId}
                      onChange={setShoppingProjectId}
                      placeholder="Velg prosjekt"
                      options={[
                        { value: '', label: 'Ingen' },
                        ...projectList.map(p => ({ value: p.id, label: p.name }))
                      ]}
                    />
                  </div>
                </>
              )}

              {projectError && <div className="fp-error" style={{ marginBottom: 8 }}>{projectError}</div>}
              {todoistApi.getStoredToken() && projectList.length === 0 && (
                <button className="btn btn-secondary btn-sm" onClick={fetchProjects} disabled={loadingProjects}>
                  {loadingProjects ? 'Laster...' : 'Last prosjekter'}
                </button>
              )}
            </div>
          )}

          {tab === 'economy' && (
            <div>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                Økonomistripen viser sensorer fra Home Assistant med entitets-ID som
                starter med «{ECONOMY_ENTITY_PREFIX}». Velg hvilke som skal vises.
              </p>

              {economySensors.length === 0 && (
                <div className="fp-error">
                  Fant ingen økonomisensorer i Home Assistant.
                </div>
              )}

              {economySensors.length > 0 && (
                <div className="form-group">
                  <label>Sensorer i økonomistripen</label>
                  {economySensors.map(s => (
                    <label key={s.id} className="fp-checkbox-label" style={{ marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={economySensorIds === null || economySensorIds.includes(s.id)}
                        onChange={() => toggleEconomySensor(s.id)}
                      />
                      {s.name}
                      <span style={{ opacity: 0.4, fontSize: '0.78em', marginLeft: 6, fontFamily: 'monospace' }}>
                        {s.id}
                      </span>
                    </label>
                  ))}
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                    Uten avhukinger skjules stripen. Nye sensorer må velges inn her.
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === 'layout' && (
            <div>
              <div className="form-group">
                <label>Visning av områder (seksjoner)</label>
                <FpDropdown
                  value={todoLayout}
                  onChange={setTodoLayout}
                  options={[
                    { value: 'stacked', label: 'Overskrifter nedover (stablet)' },
                    { value: 'columns', label: 'Side om side (kolonner)' },
                    { value: 'packed', label: 'Kolonner, tett pakket' },
                  ]}
                />
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  Gjelder kun denne profilen/enheten. «Side om side» passer brede paneler.
                  «Tett pakket» gir lange kategorier egen kolonne og stabler de korte under hverandre.
                </p>
              </div>

              {(todoLayout === 'columns' || todoLayout === 'packed') && (
                <div className="form-group">
                  <label>{todoLayout === 'packed' ? 'Antall kolonner' : 'Kategorier per rad'}</label>
                  <FpDropdown
                    value={todoColumnsCount}
                    onChange={setTodoColumnsCount}
                    options={[
                      { value: '', label: 'Automatisk (etter plass)' },
                      { value: '2', label: '2 per rad' },
                      { value: '3', label: '3 per rad' },
                      { value: '4', label: '4 per rad' },
                      { value: '5', label: '5 per rad' },
                    ]}
                  />
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                    {todoLayout === 'packed'
                      ? 'Kategoriene fordeles på kolonnene etter lengde. «Automatisk» tilpasser etter bredden.'
                      : 'Antall kategorikolonner før neste rad. «Automatisk» tilpasser etter bredden.'}
                  </p>
                </div>
              )}

              <div className="form-group">
                <label>Kolonnebredder</label>
                {(() => {
                  const visible = SECTIONS.filter(s => s.key !== 'shopping' || showShopping);
                  const total = visible.reduce((sum, s) => sum + (sectionWidths[s.key] || 1), 0);
                  return visible.map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ width: 90, fontSize: '0.85rem' }}>{label}</span>
                      <input
                        type="range"
                        min="0.5" max="3" step="0.1"
                        value={sectionWidths[key] || 1}
                        onChange={e => setSectionWidths(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                        style={{ flex: 1 }}
                      />
                      <span style={{ width: 42, textAlign: 'right', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(((sectionWidths[key] || 1) / total) * 100)} %
                      </span>
                    </div>
                  ));
                })()}
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  Bestemmer hvor stor andel av bredden hver kolonne får.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Avbryt</button>
          <button className="btn btn-primary" onClick={handleSave}>Lagre</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Waste collection banner + oversikt ───────────────────────────────────
// Leser samme waste_collection-composite som TrashTile (se hub-mapper).
// Banneret viser alltid nærmeste hentedag; klikk åpner full oversikt.

const formatWasteDays = (days) => {
  const n = parseInt(days, 10);
  if (isNaN(n)) return null;
  if (n === 0) return 'I dag';
  if (n === 1) return 'I morgen';
  if (n < 0) return 'Passert';
  return `Om ${n} dager`;
};

// Beregn dager fra dato-streng (DD/MM/YYYY eller ISO). HA-integrasjonens
// days_until-attributt oppdateres kun én gang i døgnet og kan være ett døgn
// bakpå – datoen er alltid korrekt, så vi regner selv.
const wasteDaysFromDate = (dateStr) => {
  if (!dateStr) return NaN;
  // DD/MM/YYYY (norsk) MÅ tolkes før native parsing – new Date('07/08/2026')
  // ville ellers blitt tolket som amerikansk MM/DD (8. juli)
  const p = String(dateStr).trim().split(/[/.]/);
  let d = (p.length === 3 && p[2].length === 4)
    ? new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}T00:00:00`)
    : new Date(dateStr);
  if (isNaN(d.getTime())) return NaN;
  d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
};

const getWasteFractions = (dev) => Object.entries(dev?.capabilitiesObj || {})
  .filter(([id]) => id.startsWith('waste_') && id !== 'waste_next_pickup_days')
  .map(([id, obj]) => {
    const computed = wasteDaysFromDate(obj.value);
    return {
      id,
      title: obj.title || id,
      daysUntil: !isNaN(computed) ? computed : parseInt(obj.days_until, 10),
      date: obj.value,
      entityPicture: obj.entity_picture,
    };
  })
  .filter(f => !isNaN(f.daysUntil))
  .sort((a, b) => a.daysUntil - b.daysUntil);

function WasteBanner({ devices, onClick }) {
  const dev = devices?.find?.(d => d.settings?.compositeType === 'waste_collection');
  const fractions = getWasteFractions(dev);
  if (!fractions.length) return null;

  const minDays = fractions[0].daysUntil;
  const next = fractions.filter(f => f.daysUntil === minDays);
  const isToday = minDays === 0;
  const isSoon = minDays === 1;

  return (
    <button
      className={`fp-waste-banner ${isToday ? 'fp-waste-banner--today' : isSoon ? 'fp-waste-banner--soon' : ''}`}
      onClick={onClick}
      title="Vis full oversikt"
    >
      <Trash2 size={22} style={{ flexShrink: 0 }} />
      <span className="fp-waste-banner-label">Søppeltømming:</span>
      <div className="fp-waste-banner-fractions">
        {next.map(f => (
          <span key={f.id} className="fp-waste-banner-fraction">
            {f.entityPicture && (
              <img src={f.entityPicture} alt="" onError={e => { e.target.style.display = 'none'; }} />
            )}
            {f.title}
          </span>
        ))}
      </div>
      <span className="fp-waste-banner-days">{formatWasteDays(minDays)}</span>
      <Maximize2 size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
    </button>
  );
}

// ─── Apparat-banner (oppvaskmaskin/vaskemaskin i gang) ────────────────────
// Vises kun mens en maskin faktisk kjører; linje under søppelbanneret.

const formatApplianceRemaining = (min) => {
  const m = Math.round(min);
  if (!(m > 0)) return null;
  const h = Math.floor(m / 60);
  return h > 0 ? `≈ ${h} t ${m % 60} min igjen` : `≈ ${m} min igjen`;
};

// Samme aktiv/inaktiv-vokabular som WasherWatcher i FinishedPromptManager
const WASHER_INACTIVE_KEYWORDS = [
  'idle', 'off', 'standby', 'inactive', 'end', 'done', 'finished',
  'ferdig', 'completed', 'stopped', 'pause', 'paused', '0',
  'unavailable', 'unknown',
];

// washdata_state-tilstander som betyr at et program pågår (delay_wait er
// bevisst utelatt — maskinen har ikke startet enda)
const APPLIANCE_RUNNING_STATES = { running: 'kjører', paused: 'er på pause' };

const APPLIANCE_KIND_META = {
  dishwasher: { icon: Utensils, name: 'Oppvaskmaskinen' },
  dryer: { icon: Shirt, name: 'Tørketrommelen' },
};

function getRunningAppliances(devices) {
  const out = [];

  // Oppvaskmaskin/tørketrommel: syklusenheter med washdata_state (Electrolux-
  // integrasjonen; washdata_* er internt vokabular). Én per applianceKind —
  // appliance_native foretrekkes, som i findCycleDevice i useApplianceState.
  const byKind = {};
  devices.forEach(d => {
    if (!d.capabilities?.includes('washdata_state') || d.settings?.compositeType !== 'appliance') return;
    const kind = d.settings?.applianceKind || 'dishwasher';
    const existing = byKind[kind];
    if (!existing || (d.capabilities.includes('appliance_native') && !existing.capabilities.includes('appliance_native'))) {
      byKind[kind] = d;
    }
  });
  Object.entries(byKind).forEach(([kind, d]) => {
    const state = String(d.capabilitiesObj?.washdata_state?.value || '').toLowerCase();
    const statusText = APPLIANCE_RUNNING_STATES[state];
    if (!statusText) return;
    const rem = parseFloat(d.capabilitiesObj?.washdata_time_remaining?.value);
    const meta = APPLIANCE_KIND_META[kind] || APPLIANCE_KIND_META.dishwasher;
    out.push({ id: d.id, ...meta, statusText, remaining: isNaN(rem) ? null : rem });
  });

  // Vaskemaskin: laundry-composite med operational_state (samme filter som
  // FinishedPromptManager). Gjenstående tid fra meter_remaining_time m.fl.
  devices.forEach(d => {
    if (d._inComposite || !d.capabilities?.includes('laundry') || !d.capabilitiesObj?.operational_state) return;
    const st = String(d.capabilitiesObj.operational_state.value || '').toLowerCase();
    if (!st || WASHER_INACTIVE_KEYWORDS.includes(st)) return;
    const timeCap = ['meter_remaining_time', 'meter_countdown', 'time_remaining', 'sensor_remaining_time', 'remaining_time']
      .find(c => d.capabilities.includes(c));
    const rem = timeCap ? parseFloat(d.capabilitiesObj[timeCap]?.value) : NaN;
    out.push({ id: d.id, icon: WashingMachine, name: 'Vaskemaskinen', statusText: 'kjører', remaining: isNaN(rem) ? null : rem });
  });

  return out;
}

function ApplianceBanner({ devices }) {
  const running = getRunningAppliances(devices || []);
  if (!running.length) return null;

  return (
    <div className="fp-appliance-banner">
      {running.map(a => {
        const Icon = a.icon;
        const remaining = a.remaining != null ? formatApplianceRemaining(a.remaining) : null;
        return (
          <span key={a.id} className="fp-appliance-banner-item">
            <Icon size={20} style={{ flexShrink: 0 }} />
            <span className="fp-appliance-banner-name">{a.name} {a.statusText}</span>
            {remaining && <span className="fp-appliance-banner-time">{remaining}</span>}
          </span>
        );
      })}
    </div>
  );
}

// ─── Økonomi-stripe ───────────────────────────────────────────────────────
// Viser økonomisensorer fra HA (entity_id-prefix sensor.okonomiflyt).
// Hvilke som vises velges i Økonomi-fanen i sideinnstillingene; uten lagret
// valg vises alle sensorer som matcher prefixet.

const ECONOMY_ENTITY_PREFIX = 'sensor.okonomiflyt';

const getEconomySensors = (devices) => (devices || [])
  .filter(d => d.entityId?.startsWith(ECONOMY_ENTITY_PREFIX))
  .map(d => {
    const cap = d.capabilitiesObj?.measure_generic;
    return {
      id: d.entityId,
      name: d.name,
      value: parseFloat(cap?.value ?? d.state),
      units: cap?.units || 'kr',
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'nb'));

const formatEconomyValue = (value, units) =>
  isNaN(value) ? '–' : `${Math.round(value).toLocaleString('nb-NO')} ${units}`;

function EconomyBanner({ devices, selectedIds }) {
  const all = getEconomySensors(devices);
  const sensors = Array.isArray(selectedIds) ? all.filter(s => selectedIds.includes(s.id)) : all;
  if (!sensors.length) return null;

  return (
    <div className="fp-economy-banner">
      <Wallet size={22} style={{ flexShrink: 0 }} />
      {sensors.map(s => (
        <span key={s.id} className="fp-economy-banner-item">
          <span className="fp-economy-banner-name">{s.name}</span>
          <span className="fp-economy-banner-value">{formatEconomyValue(s.value, s.units)}</span>
        </span>
      ))}
    </div>
  );
}

function WasteOverview({ device }) {
  const fractions = getWasteFractions(device);
  const summary = device?.capabilitiesObj?.waste_next_pickup_days;

  if (!fractions.length) {
    return <div className="fp-empty"><Trash2 size={32} opacity={0.3} /><p>Ingen hentinger</p></div>;
  }

  return (
    <div className="fp-list-content">
      {summary && (
        <div className="fp-waste-summary">
          <span>{summary.fractions || 'Neste henting'}</span>
          <div className="fp-waste-summary-when">
            <span className="fp-waste-summary-days">
              {formatWasteDays(!isNaN(wasteDaysFromDate(summary.collection_date)) ? wasteDaysFromDate(summary.collection_date) : summary.value)}
            </span>
            {summary.collection_date && <span className="fp-waste-summary-date">{summary.collection_date}</span>}
          </div>
        </div>
      )}
      {fractions.map(f => (
        <div key={f.id} className="fp-waste-row">
          {f.entityPicture
            ? <img src={f.entityPicture} alt="" onError={e => { e.target.style.display = 'none'; }} />
            : <Trash2 size={24} style={{ opacity: 0.5 }} />}
          <span className="fp-waste-row-title">{f.title}</span>
          <div className="fp-waste-row-when">
            <span className={`fp-waste-row-days ${f.daysUntil <= 1 ? 'urgent' : f.daysUntil <= 3 ? 'soon' : ''}`}>
              {formatWasteDays(f.daysUntil)}
            </span>
            {f.date && <span className="fp-waste-row-date">{f.date}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Klokke/dato-hjørne ───────────────────────────────────────────────────

function CornerClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 10 * 1000);
    return () => clearInterval(iv);
  }, []);

  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const date = `${DAYS_NO[now.getDay()]} ${now.getDate()}. ${MONTHS_NO[now.getMonth()]}`;

  return (
    <div className="fp-corner-clock">
      <span className="fp-corner-clock-time">{time}</span>
      <span className="fp-corner-clock-date">{date}</span>
    </div>
  );
}

// ─── Main FamilyPage ──────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'todo', label: 'Huskeliste', icon: CheckSquare },
  { key: 'calendar', label: 'Kalender', icon: Calendar },
  { key: 'shopping', label: 'Handleliste', icon: ShoppingCart },
];

export default function FamilyPage({ page }) {
  const { updatePage, isEditMode, devices } = useHomey();
  const [expanded, setExpanded] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tokenVersion, setTokenVersion] = useState(0);
  const [localSettings, setLocalSettings] = useState(page?.familySettings || {});

  // Shared list state — lifted so widget and expanded modal stay in sync
  const [calEvents, setCalEvents] = useState([]);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState(null);
  const [todoTasks, setTodoTasks] = useState([]);
  const [todoSections, setTodoSections] = useState([]);
  const [todoLoading, setTodoLoading] = useState(false);
  const [todoError, setTodoError] = useState(null);
  const [shoppingItems, setShoppingItems] = useState([]);
  const [shoppingSections, setShoppingSections] = useState([]);
  const [shoppingLoading, setShoppingLoading] = useState(false);
  const [shoppingError, setShoppingError] = useState(null);

  // Load settings and tokens from dedicated storage keys (Firebase-backed, cross-origin)
  useEffect(() => {
    let cancelled = false;
    async function syncAll() {
      // Load page settings from dedicated key (falls through to Firebase if not in localStorage)
      const savedSettings = await loadPageSettings(page.id);
      const mergedSettings = { ...(page?.familySettings || {}), ...savedSettings };
      if (!cancelled) setLocalSettings(mergedSettings);

      const creds = await loadCredentials();
      if (!cancelled) {
        if (creds.todoistToken) {
          todoistApi.setToken(creds.todoistToken);
        }
        setTokenVersion(v => v + 1);
      }
    }
    syncAll();
    return () => { cancelled = true; };
  }, [page?.id]);

  const settings = localSettings;

  const fetchCalendarEvents = useCallback(async () => {
    const ids = settings?.haCalendarIds || [];
    if (!ids.length || !calApi.isConnected()) return;
    setCalLoading(true);
    setCalError(null);
    try {
      const evs = await calApi.getEvents(ids, settings?.calendarDaysAhead || 14);
      setCalEvents(evs);
    } catch (e) {
      setCalError('Kunne ikke hente hendelser');
    } finally {
      setCalLoading(false);
    }
  }, [settings?.haCalendarIds, settings?.calendarDaysAhead]);

  useEffect(() => {
    if (!settings?.haCalendarIds?.length) return;
    // HA-tilkoblingen kan fortsatt være under oppkobling ved mount — prøv igjen til den er oppe
    let retryTimer = null;
    const initialFetch = () => {
      if (!calApi.isConnected()) {
        retryTimer = setTimeout(initialFetch, 3000);
        return;
      }
      fetchCalendarEvents();
    };
    initialFetch();
    const iv = setInterval(fetchCalendarEvents, 2 * 60 * 1000);
    return () => { clearInterval(iv); if (retryTimer) clearTimeout(retryTimer); };
  }, [fetchCalendarEvents]);

  const fetchTodoTasks = useCallback(async () => {
    if (!todoistApi.getStoredToken()) return;
    setTodoLoading(true);
    setTodoError(null);
    try {
      const projectId = settings?.todoProjectId || null;
      const t = await todoistApi.getTasks(projectId);
      setTodoTasks(t || []);
      // Seksjoner brukes som kategori-overskrifter; finnes kun når et prosjekt er valgt
      if (projectId) {
        try {
          const secs = await todoistApi.getSections(projectId);
          setTodoSections(secs || []);
        } catch { /* seksjoner er valgfritt – ignorer feil */ }
      } else {
        setTodoSections([]);
      }
    } catch (e) {
      if (e.message === 'INVALID_TOKEN') setTodoError('Ugyldig Todoist-token');
      else if (e.message === 'PROJECT_GONE') setTodoError('Todoist-prosjektet finnes ikke. Sjekk innstillinger.');
      else setTodoError('Kunne ikke hente oppgaver');
    } finally {
      setTodoLoading(false);
    }
  }, [settings?.todoProjectId, tokenVersion]);

  const fetchShoppingItems = useCallback(async () => {
    if (!todoistApi.getStoredToken() || !settings?.shoppingProjectId) return;
    setShoppingLoading(true);
    setShoppingError(null);
    try {
      const [t, secs] = await Promise.allSettled([
        todoistApi.getTasks(settings.shoppingProjectId),
        todoistApi.getSections(settings.shoppingProjectId),
      ]);
      if (t.status === 'fulfilled') setShoppingItems(t.value || []);
      else throw t.reason;
      if (secs.status === 'fulfilled') setShoppingSections(secs.value || []);
    } catch (e) {
      if (e.message === 'PROJECT_GONE') setShoppingError('Handleliste-prosjektet finnes ikke. Sjekk innstillinger.');
      else setShoppingError('Kunne ikke hente handleliste');
    } finally {
      setShoppingLoading(false);
    }
  }, [settings?.shoppingProjectId, tokenVersion]);

  useEffect(() => {
    if (!todoistApi.getStoredToken()) return;
    fetchTodoTasks();
    const iv = setInterval(fetchTodoTasks, 30 * 1000);
    return () => clearInterval(iv);
  }, [fetchTodoTasks]);

  useEffect(() => {
    if (!settings?.showShopping || !todoistApi.getStoredToken() || !settings?.shoppingProjectId) return;
    fetchShoppingItems();
    const iv = setInterval(fetchShoppingItems, 30 * 1000);
    return () => clearInterval(iv);
  }, [fetchShoppingItems, settings?.showShopping]);

  const handleSaveSettings = async (newSettings) => {
    const { todoistToken, ...pageSettings } = newSettings;
    const mergedPageSettings = { ...settings, ...pageSettings };

    // Save to page (for compatibility) and to dedicated cross-origin key
    await updatePage({ ...page, familySettings: mergedPageSettings });
    await savePageSettings(page.id, mergedPageSettings);
    setLocalSettings(mergedPageSettings);

    // Save token to dedicated credentials storage (syncs cross-origin via Firebase)
    const existingCreds = await loadCredentials();
    const updatedCreds = {
      ...existingCreds,
      ...(todoistToken !== undefined && { todoistToken }),
    };
    await saveCredentials(updatedCreds);

    if (updatedCreds.todoistToken) todoistApi.setToken(updatedCreds.todoistToken);
    setTokenVersion(v => v + 1);
  };

  const renderSection = (key, isExpanded) => {
    if (key === 'calendar') return (
      <CalendarSection
        settings={settings} expanded={isExpanded}
        events={calEvents} loading={calLoading} error={calError}
        onEventsChange={setCalEvents} onRefresh={fetchCalendarEvents}
      />
    );
    if (key === 'todo') return (
      <TodoSection
        settings={settings} expanded={isExpanded}
        tasks={todoTasks} sections={todoSections} loading={todoLoading} error={todoError}
        onTasksChange={setTodoTasks} onRefresh={fetchTodoTasks}
      />
    );
    if (key === 'shopping') return (
      <ShoppingSection
        settings={settings} expanded={isExpanded}
        items={shoppingItems} sections={shoppingSections} loading={shoppingLoading} error={shoppingError}
        onItemsChange={setShoppingItems} onRefresh={fetchShoppingItems}
      />
    );
    if (key === 'waste') return (
      <WasteOverview device={devices?.find?.(d => d.settings?.compositeType === 'waste_collection')} />
    );
  };

  return (
    <div className={`family-page ${isEditMode ? 'family-page--edit' : ''}`}>
      {/* Header bar — kun synlig i edit-mode */}
      {isEditMode && (
        <div className="fp-header">
          <Users size={18} style={{ opacity: 0.6 }} />
          <span className="fp-header-title">{page?.name || 'Familie'}</span>
          <button className="fp-settings-btn" onClick={() => setShowSettings(true)} title="Innstillinger">
            <Settings size={16} />
          </button>
        </div>
      )}

      <CornerClock />
      <WasteBanner devices={devices} onClick={() => !isEditMode && setExpanded('waste')} />
      <EconomyBanner devices={devices} selectedIds={settings?.economySensorIds} />
      <ApplianceBanner devices={devices} />

      {/* Column layout (shopping hidden unless enabled) */}
      <div className="fp-columns">
        {SECTIONS.filter(s => s.key !== 'shopping' || settings?.showShopping).map(({ key, label, icon: Icon }) => {
          const onRefresh = key === 'todo' ? fetchTodoTasks : key === 'shopping' ? fetchShoppingItems : key === 'calendar' ? fetchCalendarEvents : null;
          const isRefreshing = key === 'todo' ? todoLoading : key === 'shopping' ? shoppingLoading : key === 'calendar' ? calLoading : false;
          const width = settings?.sectionWidths?.[key] ?? (key === 'calendar' ? 1.4 : 1);
          return (
            <div key={key} className="fp-column" style={{ flex: width }}>
              <div className="fp-column-header" onClick={() => !isEditMode && setExpanded(key)}>
                <Icon size={16} style={{ opacity: 0.7 }} />
                <span className="fp-column-title">{label}</span>
                {!isEditMode && onRefresh && (
                  <button
                    className="fp-refresh-btn"
                    onClick={e => { e.stopPropagation(); onRefresh(); }}
                    title="Oppdater"
                    style={{ marginLeft: 'auto', marginRight: 4 }}
                  >
                    <RefreshCw size={13} className={isRefreshing ? 'fp-spin' : ''} />
                  </button>
                )}
                {!isEditMode && <Maximize2 size={14} style={{ opacity: 0.4 }} />}
              </div>
              <div className="fp-column-body">
                {renderSection(key, false)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded overlay */}
      {expanded && !isEditMode && (() => {
        const sec = SECTIONS.find(s => s.key === expanded)
          || (expanded === 'waste' ? { label: 'Søppeltømming', icon: Trash2 } : null);
        const Icon = sec?.icon;
        return createPortal(
          <div className="fp-overlay" onClick={e => e.target === e.currentTarget && setExpanded(null)}>
            <div className="fp-overlay-panel">
              <div className="fp-overlay-header">
                {Icon && <Icon size={18} style={{ opacity: 0.7 }} />}
                <h2 className="fp-overlay-title">{sec?.label}</h2>
                <button className="icon-btn" onClick={() => setExpanded(null)}><X size={22} /></button>
              </div>
              <div className="fp-overlay-body">
                {renderSection(expanded, true)}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Settings modal */}
      {showSettings && (
        <FamilySettingsModal
          page={page}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
}
