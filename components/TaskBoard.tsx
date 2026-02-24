
import React from 'react';
import { Task, TaskStatus, User } from '../types';
import { CheckCircle2, Clock, MoreHorizontal, User as UserIcon, ArrowRight, ArrowLeft, Trash2, Plus, MessageCircle } from 'lucide-react';
import { USERS } from '../constants';

interface TaskBoardProps {
    tasks: Task[];
    onUpdateStatus: (taskId: string, status: TaskStatus) => void;
    onDeleteTask?: (taskId: string) => void;
    onChatSelect?: (conversationId: string) => void; // Prop for navigation
    teamMembers?: User[];
}

const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, onUpdateStatus, onDeleteTask, onChatSelect, teamMembers }) => {
  const columns: { id: TaskStatus; label: string; color: string }[] = [
      { id: 'todo', label: 'To Do', color: 'bg-slate-500' },
      { id: 'in_progress', label: 'In Progress', color: 'bg-blue-500' },
      { id: 'done', label: 'Done', color: 'bg-green-500' }
  ];

    const getAssignee = (id: string) => {
        // Prefer provided teamMembers, fallback to static USERS mock
        const fromProps = (teamMembers || []) as User[];
        const found = fromProps.find(u => u.id === id) || USERS.find(u => u.id === id);
        return found;
    };

  const moveTask = (taskId: string, currentStatus: TaskStatus, direction: 'prev' | 'next') => {
      const currentIndex = columns.findIndex(c => c.id === currentStatus);
      const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      
      if (newIndex >= 0 && newIndex < columns.length) {
          onUpdateStatus(taskId, columns[newIndex].id);
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6 overflow-hidden">
      <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Team Tasks</h1>
            <p className="text-sm text-slate-500">Manage follow-ups and internal assignments.</p>
          </div>
          <button onClick={() => alert("Coming Soon: Create Task directly from board. Currently please create tasks inside the Chat window.")} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2 shadow-sm font-medium opacity-80">
              <Plus size={18} /> New Task
          </button>
      </div>

      <div className="flex gap-6 h-full overflow-x-auto pb-4">
          {columns.map((col, colIndex) => (
              <div key={col.id} className="min-w-[300px] w-1/3 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${col.color}`}></div>
                        <h3 className="font-bold text-slate-700">{col.label}</h3>
                      </div>
                      <span className="bg-slate-200 px-2 py-0.5 rounded-full text-xs font-bold text-slate-600">{tasks.filter(t => t.status === col.id).length}</span>
                  </div>

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
                                            <button onClick={() => onDeleteTask?.(task.id)} className="text-red-500 text-xs flex gap-1 items-center px-2 py-1 hover:bg-red-50 w-full whitespace-nowrap"><Trash2 size={12}/> Delete</button>
                                        </div>
                                      </div>
                                  </div>

                                  {/* Explicit rendering for Client Name and Chat Button */}
                                  <div className="flex items-center justify-between mb-2 mt-2">
                                      {task.clientName ? (
                                        <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit">
                                            <MessageCircle size={12} />
                                            <span className="font-medium truncate max-w-[140px]">{task.clientName}</span>
                                        </div>
                                      ) : <div></div>}
                                      
                                      {task.conversationId && onChatSelect && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onChatSelect(task.conversationId!);
                                                }}
                                                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 hover:border-emerald-200 transition-colors"
                                            >
                                                Chat <ArrowRight size={12} />
                                            </button>
                                      )}
                                  </div>

                                  <p className="text-sm text-slate-500 mb-4 line-clamp-3">{task.description || 'No description.'}</p>
                                  
                                  <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                      <div className="flex items-center gap-3">
                                          {assignee ? (
                                              <div className="flex items-center gap-2">
                                                  <img src={assignee.avatar} className="w-6 h-6 rounded-full border border-white shadow-sm" title={`Assigned to ${assignee.name}`} />
                                                  <span className="text-xs font-medium text-slate-700 truncate max-w-[140px]">{assignee.name}</span>
                                              </div>
                                          ) : (
                                              <div className="flex items-center gap-2">
                                                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center"><UserIcon size={12} /></div>
                                                  <span className="text-xs text-slate-500">Unassigned</span>
                                              </div>
                                          )}
                                          <div className={`flex items-center text-xs gap-1 ${task.dueDate < new Date() ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                              <Clock size={12} />
                                              <span>{task.dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                          </div>
                                      </div>
                                      
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          {colIndex > 0 && (
                                              <button onClick={() => moveTask(task.id, col.id, 'prev')} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Move Back"><ArrowLeft size={16} /></button>
                                          )}
                                          {colIndex < columns.length - 1 && (
                                              <button onClick={() => moveTask(task.id, col.id, 'next')} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Move Next"><ArrowRight size={16} /></button>
                                          )}
                                      </div>
                                  </div>
                              </div>
                          );
                      })}
                      {tasks.filter(t => t.status === col.id).length === 0 && (
                          <div className="text-center py-10 text-slate-400 text-sm italic">No tasks here</div>
                      )}
                  </div>
              </div>
          ))}
      </div>
    </div>
  );
};

export default TaskBoard;
