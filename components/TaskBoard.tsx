
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Task, TaskStatus, User, WhatsAppPhoneNumber } from '../types';
import { Clock, MoreHorizontal, User as UserIcon, ArrowRight, ArrowLeft, Trash2, Plus, MessageCircle, Phone, Pencil, Check, X, Settings, ChevronUp, ChevronDown } from 'lucide-react';
import { USERS } from '../constants';
import { taskBoardService, TaskBoardPhase } from '../services/taskBoardService';

type ColumnDef = TaskBoardPhase;

const DEFAULT_COLUMNS: ColumnDef[] = taskBoardService.getDefaultPhases();

const PHASE_COLORS = [
    'bg-slate-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
    'bg-orange-500', 'bg-purple-500', 'bg-pink-500', 'bg-red-500', 'bg-teal-500',
];

interface TaskBoardProps {
    tasks: Task[];
    onUpdateStatus: (taskId: string, status: TaskStatus) => void;
    onDeleteTask?: (taskId: string) => void;
    onAddTask?: (task: Task) => void;
    onChatSelect?: (conversationId: string) => void;
    teamMembers?: User[];
    phoneNumbers?: WhatsAppPhoneNumber[];
    currentUser?: User | null;
    organizationId?: string;
}

const TaskBoard: React.FC<TaskBoardProps> = ({
    tasks, onUpdateStatus, onDeleteTask, onAddTask, onChatSelect,
    teamMembers, phoneNumbers = [], currentUser, organizationId
}) => {
    // ── Columns (persistent per org in DB) ──────────────────────────────
    const [columns, setColumns] = useState<ColumnDef[]>(DEFAULT_COLUMNS);
    const [columnsLoaded, setColumnsLoaded] = useState(false);

    // Load columns from DB on mount / org change
    useEffect(() => {
        if (!organizationId) { setColumnsLoaded(true); return; }
        taskBoardService.getPhases(organizationId).then(saved => {
            setColumns(saved);
            setColumnsLoaded(true);
        });
    }, [organizationId]);

    // Persist columns to DB whenever they change (after initial load)
    const saveColumns = useCallback((newCols: ColumnDef[]) => {
        setColumns(newCols);
        if (organizationId) {
            taskBoardService.savePhases(organizationId, newCols);
        }
    }, [organizationId]);

    // ── Column editing state ─────────────────────────────────────────────
    const [editingColId, setEditingColId] = useState<string | null>(null);
    const [editingLabel, setEditingLabel] = useState('');
    const [editingColor, setEditingColor] = useState(PHASE_COLORS[0]);
    const [showAddPhase, setShowAddPhase] = useState(false);
    const [newPhaseLabel, setNewPhaseLabel] = useState('');
    const [newPhaseColor, setNewPhaseColor] = useState(PHASE_COLORS[0]);
    const [showPhaseManager, setShowPhaseManager] = useState(false);

    // ── Nueva Tarea modal state ──────────────────────────────────────────
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskDescription, setNewTaskDescription] = useState('');
    const [newTaskAssignee, setNewTaskAssignee] = useState(currentUser?.id || '');
    const [newTaskDueDate, setNewTaskDueDate] = useState('');
    const [newTaskStatus, setNewTaskStatus] = useState<string>(columns[0]?.id || 'todo');
    const [isSaving, setIsSaving] = useState(false);
    const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
    const assigneeRef = useRef<HTMLDivElement>(null);

    // Close assignee dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) {
                setShowAssigneeDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const members = teamMembers || [];

    const getAssignee = (id: string) => {
        const found = members.find(u => u.id === id) || USERS.find(u => u.id === id);
        return found;
    };

    const moveTask = (taskId: string, currentStatus: string, direction: 'prev' | 'next') => {
        const currentIndex = columns.findIndex(c => c.id === currentStatus);
        const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
        if (newIndex >= 0 && newIndex < columns.length) {
            onUpdateStatus(taskId, columns[newIndex].id as TaskStatus);
        }
    };

    // ── Column editing handlers ───────────────────────────────────────────
    const startEditCol = (col: ColumnDef) => {
        setEditingColId(col.id);
        setEditingLabel(col.label);
        setEditingColor(col.color);
    };
    const confirmEditCol = () => {
        if (!editingLabel.trim() || !editingColId) return;
        saveColumns(columns.map(c => c.id === editingColId ? { ...c, label: editingLabel.trim(), color: editingColor } : c));
        setEditingColId(null);
    };
    const cancelEditCol = () => setEditingColId(null);

    const addPhase = () => {
        if (!newPhaseLabel.trim()) return;
        const id = `custom_${Date.now()}`;
        saveColumns([...columns, { id, label: newPhaseLabel.trim(), color: newPhaseColor, position: columns.length }]);
        setNewPhaseLabel('');
        setNewPhaseColor(PHASE_COLORS[0]);
        setShowAddPhase(false);
    };

    const deletePhase = (id: string) => {
        if (DEFAULT_COLUMNS.some(d => d.id === id)) return; // protect defaults
        saveColumns(columns.filter(c => c.id !== id));
    };

    const movePhase = (id: string, direction: 'up' | 'down') => {
        const idx = columns.findIndex(c => c.id === id);
        if (idx === -1) return;
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= columns.length) return;
        const reordered = [...columns];
        [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
        saveColumns(reordered);
    };

    // ── Nueva Tarea handler ───────────────────────────────────────────────
    const handleCreateTask = async () => {
        if (!newTaskTitle.trim() || !onAddTask) return;
        setIsSaving(true);
        try {
            const localTask: Task = {
                id: Date.now().toString(),
                title: newTaskTitle.trim(),
                description: newTaskDescription.trim(),
                status: newTaskStatus as TaskStatus,
                assigneeId: newTaskAssignee || currentUser?.id || '',
                dueDate: newTaskDueDate ? new Date(newTaskDueDate) : new Date(Date.now() + 86400000),
            };
            await onAddTask(localTask);
            setShowTaskModal(false);
            setNewTaskTitle('');
            setNewTaskDescription('');
            setNewTaskAssignee(currentUser?.id || '');
            setNewTaskDueDate('');
            setNewTaskStatus(columns[0]?.id || 'todo');
        } finally {
            setIsSaving(false);
        }
    };

    const openNewTask = (colId?: string) => {
        setNewTaskStatus(colId || columns[0]?.id || 'todo');
        setNewTaskAssignee(currentUser?.id || '');
        setShowTaskModal(true);
    };

    return (
        <div className="flex flex-col h-full w-full bg-slate-50 p-3 sm:p-6 overflow-hidden">
            {/* Header */}
            <div className="mb-4 sm:mb-6 flex justify-between items-center flex-wrap gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Tareas del Equipo</h1>
                    <p className="text-sm text-slate-500">Gestiona seguimientos y asignaciones internas.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowPhaseManager(true)}
                        className="border border-slate-300 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100 flex items-center gap-2 text-sm font-medium"
                        title="Gestionar fases"
                    >
                        <Settings size={16} /> <span className="hidden sm:inline">Fases</span>
                    </button>
                    <button
                        onClick={() => openNewTask()}
                        className="bg-emerald-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2 shadow-sm font-medium text-sm"
                    >
                        <Plus size={18} /> <span className="hidden sm:inline">Nueva Tarea</span>
                    </button>
                </div>
            </div>

            {/* Kanban board */}
            <div className="flex gap-3 sm:gap-4 h-full overflow-x-auto pb-4">
                {columns.map((col, colIndex) => (
                    <div key={col.id} className="flex-1 min-w-[260px] flex flex-col h-full">
                        {/* Column header */}
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${col.color}`}></div>
                                {editingColId === col.id ? (
                                    <div className="flex items-center gap-1 flex-1">
                                        <input
                                            autoFocus
                                            value={editingLabel}
                                            onChange={e => setEditingLabel(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') confirmEditCol(); if (e.key === 'Escape') cancelEditCol(); }}
                                            className="border rounded px-2 py-0.5 text-sm font-bold text-slate-700 w-full focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                        />
                                        <button onClick={confirmEditCol} className="text-emerald-600 hover:text-emerald-700"><Check size={14} /></button>
                                        <button onClick={cancelEditCol} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 group/title flex-1 min-w-0">
                                        <h3 className="font-bold text-slate-700 truncate">{col.label}</h3>
                                        <button
                                            onClick={() => startEditCol(col)}
                                            className="opacity-0 group-hover/title:opacity-100 transition-opacity text-slate-400 hover:text-slate-600 flex-shrink-0"
                                            title="Editar nombre"
                                        >
                                            <Pencil size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <span className="bg-slate-200 px-2 py-0.5 rounded-full text-xs font-bold text-slate-600 ml-2 flex-shrink-0">
                                {tasks.filter(t => t.status === col.id).length}
                            </span>
                        </div>

                        {/* Cards */}
                        <div className="bg-slate-100 rounded-xl p-3 flex-1 overflow-y-auto space-y-3">
                            {tasks.filter(t => t.status === col.id).map(task => {
                                const assignee = getAssignee(task.assigneeId);
                                return (
                                    <div key={task.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 group relative hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="font-bold text-slate-800 line-clamp-2">{task.title}</h4>
                                            <div className="relative group/menu">
                                                <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={16} /></button>
                                                <div className="hidden group-hover/menu:block absolute right-0 bg-white border shadow-md rounded p-1 z-10">
                                                    <button onClick={() => onDeleteTask?.(task.id)} className="text-red-500 text-xs flex gap-1 items-center px-2 py-1 hover:bg-red-50 w-full whitespace-nowrap"><Trash2 size={12} /> Eliminar</button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mb-2 mt-2">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {task.clientName && (
                                                    <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit">
                                                        <MessageCircle size={12} />
                                                        <span className="font-medium truncate max-w-[140px]">{task.clientName}</span>
                                                    </div>
                                                )}
                                                {task.whatsappPhoneNumberId && phoneNumbers.length > 0 && (() => {
                                                    const taskPhone = phoneNumbers.find(p => p.id === task.whatsappPhoneNumberId);
                                                    return taskPhone ? (
                                                        <div className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                                            <Phone size={10} />
                                                            <span className="font-medium truncate max-w-[100px]">{taskPhone.label || taskPhone.displayPhoneNumber}</span>
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </div>
                                            {task.conversationId && onChatSelect && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onChatSelect(task.conversationId!); }}
                                                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 hover:border-emerald-200 transition-colors"
                                                >
                                                    Chat <ArrowRight size={12} />
                                                </button>
                                            )}
                                        </div>

                                        <p className="text-sm text-slate-500 mb-4 line-clamp-3">{task.description || 'Sin descripción.'}</p>

                                        <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                            <div className="flex items-center gap-3">
                                                {assignee ? (
                                                    <div className="flex items-center gap-2">
                                                        <img src={assignee.avatar} className="w-6 h-6 rounded-full border border-white shadow-sm" title={`Asignado a ${assignee.name}`} />
                                                        <span className="text-xs font-medium text-slate-700 truncate max-w-[120px]">{assignee.name}</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center"><UserIcon size={12} /></div>
                                                        <span className="text-xs text-slate-500">Sin asignar</span>
                                                    </div>
                                                )}
                                                <div className={`flex items-center text-xs gap-1 ${task.dueDate < new Date() ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                                    <Clock size={12} />
                                                    <span>{task.dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                                </div>
                                            </div>

                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {colIndex > 0 && (
                                                    <button onClick={() => moveTask(task.id, col.id, 'prev')} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Mover atrás"><ArrowLeft size={16} /></button>
                                                )}
                                                {colIndex < columns.length - 1 && (
                                                    <button onClick={() => moveTask(task.id, col.id, 'next')} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Mover adelante"><ArrowRight size={16} /></button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {tasks.filter(t => t.status === col.id).length === 0 && (
                                <div className="text-center py-10 text-slate-400 text-sm italic">Sin tareas aquí</div>
                            )}
                            {/* Quick add button per column */}
                            {onAddTask && (
                                <button
                                    onClick={() => openNewTask(col.id)}
                                    className="w-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                                >
                                    <Plus size={14} /> Agregar tarea
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Phase Manager Modal ───────────────────────────────────── */}
            {showPhaseManager && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold">Gestionar Fases</h3>
                            <button onClick={() => setShowPhaseManager(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>

                        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                            {columns.map((col, colIdx) => (
                                <div key={col.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 hover:bg-slate-50">
                                    {/* Move up/down buttons */}
                                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                                        <button
                                            onClick={() => movePhase(col.id, 'up')}
                                            disabled={colIdx === 0}
                                            className="text-slate-300 hover:text-slate-500 disabled:opacity-20 disabled:cursor-not-allowed"
                                            title="Subir"
                                        ><ChevronUp size={14} /></button>
                                        <button
                                            onClick={() => movePhase(col.id, 'down')}
                                            disabled={colIdx === columns.length - 1}
                                            className="text-slate-300 hover:text-slate-500 disabled:opacity-20 disabled:cursor-not-allowed"
                                            title="Bajar"
                                        ><ChevronDown size={14} /></button>
                                    </div>
                                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${col.color}`}></div>
                                    {editingColId === col.id ? (
                                        <div className="flex flex-col gap-1.5 flex-1">
                                            <div className="flex items-center gap-1">
                                                <input
                                                    autoFocus
                                                    value={editingLabel}
                                                    onChange={e => setEditingLabel(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') confirmEditCol(); if (e.key === 'Escape') cancelEditCol(); }}
                                                    className="border rounded px-2 py-0.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                />
                                                <button onClick={confirmEditCol} className="text-emerald-600 flex-shrink-0"><Check size={14} /></button>
                                                <button onClick={cancelEditCol} className="text-slate-400 flex-shrink-0"><X size={14} /></button>
                                            </div>
                                            <div className="flex gap-1 flex-wrap">
                                                {PHASE_COLORS.map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => setEditingColor(c)}
                                                        className={`w-5 h-5 rounded-full ${c} ${editingColor === c ? 'ring-2 ring-offset-1 ring-slate-700' : ''}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="flex-1 text-sm text-slate-700">{col.label}</span>
                                            <button onClick={() => startEditCol(col)} className="text-slate-400 hover:text-slate-600 p-1"><Pencil size={13} /></button>
                                            {!DEFAULT_COLUMNS.some(d => d.id === col.id) && (
                                                <button onClick={() => deletePhase(col.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                                            )}
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Add new phase */}
                        {showAddPhase ? (
                            <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Nombre de la fase"
                                    value={newPhaseLabel}
                                    onChange={e => setNewPhaseLabel(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') addPhase(); if (e.key === 'Escape') setShowAddPhase(false); }}
                                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                                <div className="flex gap-1.5 flex-wrap">
                                    {PHASE_COLORS.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setNewPhaseColor(c)}
                                            className={`w-6 h-6 rounded-full ${c} ${newPhaseColor === c ? 'ring-2 ring-offset-1 ring-slate-700' : ''}`}
                                        />
                                    ))}
                                </div>
                                <div className="flex gap-2 pt-1">
                                    <button onClick={addPhase} disabled={!newPhaseLabel.trim()} className="flex-1 bg-emerald-600 text-white py-1.5 rounded text-sm disabled:opacity-50">Agregar</button>
                                    <button onClick={() => setShowAddPhase(false)} className="flex-1 bg-slate-200 text-slate-700 py-1.5 rounded text-sm">Cancelar</button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowAddPhase(true)}
                                className="w-full border-2 border-dashed border-slate-300 text-slate-500 hover:border-emerald-400 hover:text-emerald-600 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
                            >
                                <Plus size={16} /> Añadir fase
                            </button>
                        )}

                        <button
                            onClick={() => setShowPhaseManager(false)}
                            className="w-full mt-3 bg-slate-800 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-900"
                        >
                            Listo
                        </button>
                    </div>
                </div>
            )}

            {/* ── Nueva Tarea Modal ─────────────────────────────────────── */}
            {showTaskModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold">Nueva Tarea</h3>
                            <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>

                        <input
                            type="text"
                            className="w-full border rounded-lg p-2.5 mb-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            placeholder="Título de la tarea *"
                            value={newTaskTitle}
                            onChange={e => setNewTaskTitle(e.target.value)}
                        />
                        <textarea
                            className="w-full border rounded-lg p-2.5 mb-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            placeholder="Descripción (opcional)"
                            rows={3}
                            value={newTaskDescription}
                            onChange={e => setNewTaskDescription(e.target.value)}
                        />

                        <div className="space-y-3 mb-4">
                            {/* Fase */}
                            <div>
                                <label className="text-xs text-slate-600 font-medium block mb-1">Fase</label>
                                <select
                                    value={newTaskStatus}
                                    onChange={e => setNewTaskStatus(e.target.value)}
                                    className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                    {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>

                            {/* Asignar a */}
                            <div>
                                <label className="text-xs text-slate-600 font-medium block mb-1">Asignar a</label>
                                <div ref={assigneeRef} className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                                        className="w-full border rounded-lg p-2 text-sm flex items-center gap-2 justify-between focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    >
                                        <div className="flex items-center gap-2">
                                            {(() => {
                                                const m = members.find(m => m.id === newTaskAssignee) || (currentUser?.id === newTaskAssignee ? currentUser : null);
                                                return m ? (
                                                    <>
                                                        <img src={m.avatar} className="w-5 h-5 rounded-full" />
                                                        <span className="truncate">{m.name}{m.id === currentUser?.id ? ' (Tú)' : ''}</span>
                                                    </>
                                                ) : <span className="text-slate-400">Sin asignar</span>;
                                            })()}
                                        </div>
                                        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" /></svg>
                                    </button>
                                    {showAssigneeDropdown && (
                                        <div className="absolute z-40 mt-1 left-0 right-0 bg-white border rounded-lg shadow-lg max-h-48 overflow-auto">
                                            {members.length > 0 ? members.map(m => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => { setNewTaskAssignee(m.id); setShowAssigneeDropdown(false); }}
                                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-3"
                                                >
                                                    <img src={m.avatar} className="w-6 h-6 rounded-full" />
                                                    <div className="flex flex-col text-sm">
                                                        <span className="font-medium text-slate-700">{m.name}{m.id === currentUser?.id ? ' (Tú)' : ''}</span>
                                                        <span className="text-xs text-slate-400">{m.email}</span>
                                                    </div>
                                                </button>
                                            )) : (
                                                <div className="p-3 text-xs text-slate-500">No hay miembros del equipo</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Fecha límite */}
                            <div>
                                <label className="text-xs text-slate-600 font-medium block mb-1">Fecha límite</label>
                                <input
                                    type="datetime-local"
                                    value={newTaskDueDate}
                                    onChange={e => setNewTaskDueDate(e.target.value)}
                                    className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={handleCreateTask}
                                disabled={!newTaskTitle.trim() || isSaving}
                                className={`flex-1 py-2 rounded-lg font-medium text-sm ${!newTaskTitle.trim() || isSaving ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                            >
                                {isSaving ? 'Guardando...' : 'Crear Tarea'}
                            </button>
                            <button
                                onClick={() => setShowTaskModal(false)}
                                className="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg text-sm hover:bg-slate-300"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaskBoard;
