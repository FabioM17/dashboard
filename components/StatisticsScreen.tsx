
import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, MessageSquare, Clock, AlertTriangle, Shield, RefreshCw, Activity, CheckCircle, XCircle, Settings } from 'lucide-react';
import { getAnalyticsDashboardData, AnalyticsDashboardData } from '../services/analyticsService';

interface StatisticsScreenProps {
  currentUser: { organizationId: string; id: string; role: string } | null;
}

const StatisticsScreen: React.FC<StatisticsScreenProps> = ({ currentUser }) => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month'>('week');
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = async () => {
    if (!currentUser?.organizationId) {
      setError('No organization ID found');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getAnalyticsDashboardData(currentUser.organizationId);
      setAnalyticsData(data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Error al cargar los datos de analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [currentUser?.organizationId]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAnalytics();
  };

  // Loading state
  if (loading && !analyticsData) {
    return (
      <div className="flex flex-col h-full bg-slate-50 justify-center items-center">
        <RefreshCw className="animate-spin text-emerald-600 mb-4" size={48} />
        <p className="text-slate-600">Cargando analytics...</p>
      </div>
    );
  }

  // Error state
  if (error && !analyticsData) {
    return (
      <div className="flex flex-col h-full bg-slate-50 justify-center items-center">
        <AlertTriangle className="text-red-500 mb-4" size={48} />
        <p className="text-slate-600 mb-4">{error}</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!analyticsData) {
    return null;
  }

  const { whatsapp, database } = analyticsData;

  // Get chart data based on selected period
  const chartData = selectedPeriod === 'week' 
    ? database.messageVolumeLastWeek 
    : database.messageVolumeLast30Days.slice(-7);

  // Calculate max value for chart scaling
  const maxValue = Math.max(...chartData.map(d => d.count), 1);

  // Calculate platform percentages
  const totalPlatformMessages = Object.values(database.messagesPerPlatform).reduce((a, b) => a + b, 0);
  const platformPercentages = totalPlatformMessages > 0 ? {
    whatsapp: ((database.messagesPerPlatform.whatsapp / totalPlatformMessages) * 100).toFixed(0),
    instagram: ((database.messagesPerPlatform.instagram / totalPlatformMessages) * 100).toFixed(0),
    messenger: ((database.messagesPerPlatform.messenger / totalPlatformMessages) * 100).toFixed(0),
    web: ((database.messagesPerPlatform.web / totalPlatformMessages) * 100).toFixed(0),
  } : { whatsapp: '0', instagram: '0', messenger: '0', web: '0' };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto p-3 sm:p-6 lg:p-8 relative">
      
      {/* WhatsApp Configuration Warning */}
      {!whatsapp.configured && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-r shadow-sm flex items-start gap-3">
          <div className="p-1 bg-amber-100 rounded-full text-amber-600">
            <Settings size={20}/>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-amber-800">Configuración Requerida</h3>
            <p className="text-sm text-amber-700">{whatsapp.configurationMessage}</p>
          </div>
        </div>
      )}

      {/* WhatsApp Quality Status (if configured) */}
      {whatsapp.configured && whatsapp.phoneNumberQuality && (
        <div className={`border-l-4 p-4 mb-6 rounded-r shadow-sm flex items-start gap-3 ${
          whatsapp.phoneNumberQuality.quality_rating === 'GREEN' 
            ? 'bg-green-50 border-green-500' 
            : whatsapp.phoneNumberQuality.quality_rating === 'YELLOW'
            ? 'bg-yellow-50 border-yellow-500'
            : 'bg-red-50 border-red-500'
        }`}>
          <div className={`p-1 rounded-full ${
            whatsapp.phoneNumberQuality.quality_rating === 'GREEN' 
              ? 'bg-green-100 text-green-600' 
              : whatsapp.phoneNumberQuality.quality_rating === 'YELLOW'
              ? 'bg-yellow-100 text-yellow-600'
              : 'bg-red-100 text-red-600'
          }`}>
            <Shield size={20}/>
          </div>
          <div className="flex-1">
            <h3 className={`font-bold ${
              whatsapp.phoneNumberQuality.quality_rating === 'GREEN' 
                ? 'text-green-800' 
                : whatsapp.phoneNumberQuality.quality_rating === 'YELLOW'
                ? 'text-yellow-800'
                : 'text-red-800'
            }`}>
              Estado WhatsApp Business: {whatsapp.phoneNumberQuality.quality_rating}
            </h3>
            <p className="text-sm text-slate-600">
              {whatsapp.phoneNumberInfo?.display_phone_number && (
                <span className="font-medium">{whatsapp.phoneNumberInfo.display_phone_number}</span>
              )}
              {' • '}
              Tier: {whatsapp.phoneNumberQuality.messaging_limit_tier}
              {whatsapp.phoneNumberInfo?.verified_name && (
                <> • Verificado: {whatsapp.phoneNumberInfo.verified_name}</>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Panel de Analíticas</h1>
          <p className="text-slate-500 text-sm">Datos en tiempo real de tu plataforma y WhatsApp Business</p>
          <p className="text-xs text-slate-400 mt-1">
            Última actualización: {new Date(analyticsData.lastUpdated).toLocaleString()}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all self-start sm:self-auto"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
        {[
          { 
            title: 'Total Mensajes', 
            value: database.totalMessages.toLocaleString(), 
            change: database.changes.totalMessages, 
            icon: MessageSquare, 
            color: 'bg-blue-500',
            subtitle: `${database.totalSent} enviados • ${database.totalReceived} recibidos`
          },
          { 
            title: 'Conversaciones Activas', 
            value: database.activeConversations.toString(), 
            change: database.changes.activeConversations, 
            icon: Users, 
            color: 'bg-purple-500',
            subtitle: `${database.conversationsByStatus.closed} cerradas • ${database.conversationsByStatus.snoozed} pospuestas`
          },
          { 
            title: 'T. Respuesta Prom.', 
            value: database.avgResponseTime, 
            change: database.changes.avgResponseTime, 
            icon: Clock, 
            color: 'bg-orange-500',
            subtitle: 'Tiempo promedio del equipo'
          },
          { 
            title: 'Tasa de Conversión', 
            value: database.conversionRate, 
            change: database.changes.conversionRate, 
            icon: TrendingUp, 
            color: 'bg-emerald-500',
            subtitle: 'Conversaciones cerradas vs total'
          },
        ].map((stat, index) => (
          <div key={index} className="bg-white p-3 sm:p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2 sm:mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-slate-500 mb-1 truncate">{stat.title}</p>
                <h3 className="text-lg sm:text-2xl font-bold text-slate-800">{stat.value}</h3>
              </div>
              <div className={`${stat.color} p-2 sm:p-3 rounded-lg text-white shadow-md flex-shrink-0 ml-2`}>
                <stat.icon size={16} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${stat.change.startsWith('+') ? 'text-green-600' : stat.change.startsWith('-') ? 'text-red-600' : 'text-slate-600'}`}>
                {stat.change} <span className="text-slate-400">vs mes ant.</span>
              </span>
            </div>
            {stat.subtitle && (
              <p className="text-xs text-slate-400 mt-2 hidden sm:block">{stat.subtitle}</p>
            )}
          </div>
        ))}
      </div>

      {/* Graphs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        
        {/* Main Chart - Message Volume */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800">Volumen de Mensajes</h3>
              <p className="text-xs text-slate-500">Mensajes totales por día</p>
            </div>
            <select 
              className="text-sm border border-slate-200 rounded-md p-2 bg-slate-50 cursor-pointer hover:border-slate-300 transition-colors"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as 'week' | 'month')}
            >
              <option value="week">Últimos 7 Días</option>
              <option value="month">Últimos 30 Días</option>
            </select>
          </div>
          
          {chartData.length > 0 ? (
            <>
              <div className="h-64 flex items-end justify-between gap-2 px-2">
                {chartData.map((item, i) => {
                  const height = maxValue > 0 ? (item.count / maxValue) * 100 : 0;
                  return (
                    <div 
                      key={i} 
                      className="flex-1 bg-emerald-100 rounded-t-sm relative group cursor-pointer hover:bg-emerald-200 transition-colors"
                      title={`${item.count} mensajes`}
                    >
                      <div 
                        style={{ height: `${Math.max(height, 2)}%` }} 
                        className="bg-emerald-500 rounded-t-md w-full absolute bottom-0 group-hover:bg-emerald-600 transition-colors"
                      ></div>
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {item.count} mensajes
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-4 text-xs text-slate-400 font-medium">
                {chartData.map((item, i) => (
                  <span key={i} className="flex-1 text-center">
                    {'day' in item ? item.day : new Date(item.date).getDate()}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <Activity className="mx-auto mb-2" size={32} />
                <p>No hay datos disponibles</p>
              </div>
            </div>
          )}
        </div>

        {/* Secondary Chart - Traffic by Channel */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Tráfico por Canal</h3>
          {totalPlatformMessages > 0 ? (
            <div className="space-y-6">
              {[
                { label: 'WhatsApp', val: `${platformPercentages.whatsapp}%`, count: database.messagesPerPlatform.whatsapp, color: 'bg-green-500' },
                { label: 'Instagram', val: `${platformPercentages.instagram}%`, count: database.messagesPerPlatform.instagram, color: 'bg-pink-500' },
                { label: 'Messenger', val: `${platformPercentages.messenger}%`, count: database.messagesPerPlatform.messenger, color: 'bg-blue-500' },
                { label: 'Web', val: `${platformPercentages.web}%`, count: database.messagesPerPlatform.web, color: 'bg-slate-500' },
              ]
                .filter(item => item.count > 0)
                .map((item, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700">{item.label}</span>
                      <span className="text-slate-500">{item.val} ({item.count})</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} transition-all`} style={{ width: item.val }}></div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-400">
              <div className="text-center">
                <BarChart3 className="mx-auto mb-2" size={32} />
                <p>No hay mensajes por plataforma</p>
              </div>
            </div>
          )}
          
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <BarChart3 size={16} />
              <span>Total mensajes: {totalPlatformMessages.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Stats & Top Agents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Campaign Statistics */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Estadísticas de Campañas</h3>
          {database.campaignStats.total > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">Total Campañas</span>
                <span className="font-bold text-slate-800">{database.campaignStats.total}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={14} className="text-green-600" />
                    <span className="text-xs text-green-700 font-medium">Entregados</span>
                  </div>
                  <span className="text-xl font-bold text-green-800">{database.campaignStats.delivered}</span>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={14} className="text-blue-600" />
                    <span className="text-xs text-blue-700 font-medium">Leídos</span>
                  </div>
                  <span className="text-xl font-bold text-blue-800">{database.campaignStats.read}</span>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity size={14} className="text-amber-600" />
                    <span className="text-xs text-amber-700 font-medium">Enviados</span>
                  </div>
                  <span className="text-xl font-bold text-amber-800">{database.campaignStats.sent}</span>
                </div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle size={14} className="text-red-600" />
                    <span className="text-xs text-red-700 font-medium">Fallidos</span>
                  </div>
                  <span className="text-xl font-bold text-red-800">{database.campaignStats.failed}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-400">
              <div className="text-center">
                <TrendingUp className="mx-auto mb-2" size={32} />
                <p>No hay campañas registradas</p>
              </div>
            </div>
          )}
        </div>

        {/* Top Performing Agents */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Top Agentes del Equipo</h3>
          {database.topPerformingAgents.length > 0 ? (
            <div className="space-y-3">
              {database.topPerformingAgents.map((agent, index) => (
                <div key={agent.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                    index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-orange-600' : 'bg-slate-300'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">{agent.name}</p>
                    <p className="text-xs text-slate-500">{agent.messagesHandled} mensajes gestionados</p>
                  </div>
                  <div className="text-right">
                    <Users size={16} className="text-emerald-600 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-400">
              <div className="text-center">
                <Users className="mx-auto mb-2" size={32} />
                <p>No hay datos de agentes disponibles</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatisticsScreen;
