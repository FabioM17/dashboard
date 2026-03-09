import React, { useState } from 'react';
import { Conversation, WhatsAppPhoneNumber } from '../types';
import { Search, Filter, MessageCircle, Phone, ChevronDown, X } from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  phoneNumbers?: WhatsAppPhoneNumber[];
  selectedPhoneFilter?: string;
  onPhoneFilterChange?: (phoneId: string) => void;
}

const ConversationList: React.FC<ConversationListProps> = ({ conversations, activeId, onSelect, phoneNumbers = [], selectedPhoneFilter = '', onPhoneFilterChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showPhoneFilter, setShowPhoneFilter] = useState(false);

  const filteredConversations = conversations.filter(c => {
    const matchesSearch = c.contactName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPhone = !selectedPhoneFilter || c.whatsappPhoneNumberId === selectedPhoneFilter;
    return matchesSearch && matchesPhone;
  });

  const activePhoneFilter = phoneNumbers.find(p => p.id === selectedPhoneFilter);

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-full md:w-80 lg:w-96 flex-shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-slate-800">Chats</h2>
          <div className="flex items-center gap-1">
            {phoneNumbers.length > 0 && (
              <button 
                onClick={() => setShowPhoneFilter(!showPhoneFilter)}
                className={`p-2 rounded-full transition-colors ${selectedPhoneFilter ? 'bg-emerald-100 text-emerald-700' : 'hover:bg-slate-200 text-slate-600'}`}
                title="Filtrar por número"
              >
                <Phone size={18} />
              </button>
            )}
            <button className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
               <Filter size={18} />
            </button>
          </div>
        </div>

        {/* Phone Number Filter */}
        {showPhoneFilter && phoneNumbers.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button 
                onClick={() => onPhoneFilterChange?.('')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  !selectedPhoneFilter ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                Todos
              </button>
              {phoneNumbers.map(phone => (
                <button 
                  key={phone.id}
                  onClick={() => onPhoneFilterChange?.(phone.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    selectedPhoneFilter === phone.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    phone.qualityRating === 'GREEN' ? 'bg-green-400' : 
                    phone.qualityRating === 'YELLOW' ? 'bg-yellow-400' : 
                    phone.qualityRating === 'RED' ? 'bg-red-400' : 'bg-slate-300'
                  }`} />
                  {phone.label || phone.displayPhoneNumber}
                </button>
              ))}
            </div>
            {selectedPhoneFilter && activePhoneFilter && (
              <div className="flex items-center gap-2 mt-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                <Phone size={12} />
                <span>Filtrando: <strong>{activePhoneFilter.label || activePhoneFilter.displayPhoneNumber}</strong></span>
                <button onClick={() => onPhoneFilterChange?.('')} className="ml-auto text-emerald-600 hover:text-emerald-800"><X size={14} /></button>
              </div>
            )}
          </div>
        )}
        
        <div className="relative">
          <input 
            type="text" 
            placeholder="Buscar conversaciones..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Search size={40} className="mb-2 opacity-50" />
            <p className="text-sm">Sin conversaciones</p>
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <div 
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`p-4 border-b border-slate-50 cursor-pointer transition-all hover:bg-slate-50 ${
                activeId === conv.id ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent'
              }`}
            >
              <div className="flex gap-3">
                <div className="relative">
                    <img 
                    src={conv.contactAvatar} 
                    alt={conv.contactName} 
                    className="w-12 h-12 rounded-full object-cover border border-slate-200"
                    />
                    {/* Platform Indicator */}
                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white 
                        ${conv.platform === 'whatsapp' ? 'bg-green-500' : 
                          conv.platform === 'messenger' ? 'bg-blue-500' : 'bg-pink-500'}`}
                    >
                        <MessageCircle size={10} className="text-white" />
                    </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className={`text-sm font-semibold truncate ${activeId === conv.id ? 'text-emerald-900' : 'text-slate-800'}`}>
                      {conv.contactName}
                    </h3>
                    <span className="text-xs text-slate-500 whitespace-nowrap ml-2">
                      {conv.lastMessageTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                  
                  <p className="text-sm text-slate-500 truncate mb-2">
                    {conv.lastMessage}
                  </p>

                  <div className="flex justify-between items-center">
                    <div className="flex gap-1 items-center">
                      {conv.whatsappPhoneNumberId && phoneNumbers.length > 1 && (() => {
                        const convPhone = phoneNumbers.find(p => p.id === conv.whatsappPhoneNumberId);
                        return convPhone ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium flex items-center gap-0.5 border border-emerald-100">
                            <Phone size={8} />
                            {convPhone.label || convPhone.displayPhoneNumber}
                          </span>
                        ) : null;
                      })()}
                      {conv.tags.map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ConversationList;