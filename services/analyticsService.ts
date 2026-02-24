import { supabase } from './supabaseClient';

// ===============================================
// TYPES & INTERFACES
// ===============================================

export interface WhatsAppAnalytics {
  phoneNumberQuality?: {
    quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
    messaging_limit_tier: string;
  };
  phoneNumberInfo?: {
    display_phone_number: string;
    verified_name: string;
    code_verification_status: string;
  };
  configured: boolean;
  configurationMessage?: string;
}

export interface DatabaseAnalytics {
  totalMessages: number;
  totalSent: number;
  totalReceived: number;
  activeConversations: number;
  avgResponseTime: string; // formatted as "Xm Ys"
  avgResponseTimeSeconds: number; // raw value in seconds
  conversionRate: string; // formatted as "X.X%"
  messagesPerPlatform: {
    whatsapp: number;
    instagram: number;
    messenger: number;
    web: number;
  };
  messageVolumeLast30Days: Array<{
    date: string;
    count: number;
  }>;
  messageVolumeLastWeek: Array<{
    day: string;
    count: number;
  }>;
  campaignStats: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  topPerformingAgents: Array<{
    id: string;
    name: string;
    messagesHandled: number;
    avgResponseTime: number;
  }>;
  conversationsByStatus: {
    open: number;
    closed: number;
    snoozed: number;
  };
  // Percentage changes compared to previous period
  changes: {
    totalMessages: string;
    activeConversations: string;
    avgResponseTime: string;
    conversionRate: string;
  };
}

export interface AnalyticsDashboardData {
  whatsapp: WhatsAppAnalytics;
  database: DatabaseAnalytics;
  lastUpdated: string;
}

// ===============================================
// WHATSAPP META API FUNCTIONS
// ===============================================

/**
 * Get WhatsApp phone number configuration
 */
async function getWhatsAppConfig(organizationId: string): Promise<{
  phoneNumberId: string | null;
  accessToken: string | null;
  phoneNumber: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', 'whatsapp')
      .single();

    if (error || !data) {
      return { phoneNumberId: null, accessToken: null, phoneNumber: null };
    }

    const credentials = data.credentials as any;
    return {
      phoneNumberId: credentials?.phone_number_id || credentials?.phone_id || null,
      accessToken: credentials?.access_token || null,
      phoneNumber: credentials?.phone_number || null,
    };
  } catch (error) {
    console.error('Error fetching WhatsApp config:', error);
    return { phoneNumberId: null, accessToken: null, phoneNumber: null };
  }
}

/**
 * Fetch analytics from WhatsApp Business API
 * Endpoint: GET /{phone-number-id}?fields=quality_rating,messaging_limit_tier,display_phone_number,verified_name,code_verification_status
 */
async function fetchWhatsAppAnalytics(
  phoneNumberId: string,
  accessToken: string
): Promise<Partial<WhatsAppAnalytics>> {
  try {
    const fields = [
      'quality_rating',
      'messaging_limit_tier',
      'display_phone_number',
      'verified_name',
      'code_verification_status',
    ].join(',');

    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`WhatsApp API Error ${response.status}:`, errorData);
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    return {
      phoneNumberQuality: {
        quality_rating: data.quality_rating || 'UNKNOWN',
        messaging_limit_tier: data.messaging_limit_tier || 'TIER_UNKNOWN',
      },
      phoneNumberInfo: {
        display_phone_number: data.display_phone_number || '',
        verified_name: data.verified_name || '',
        code_verification_status: data.code_verification_status || 'UNKNOWN',
      },
      configured: true,
    };
  } catch (error) {
    console.error('Error fetching WhatsApp analytics:', error);
    return {
      configured: false,
      configurationMessage: 'Error al obtener datos de WhatsApp API. Verifica tu configuración.',
    };
  }
}

/**
 * Get WhatsApp analytics with configuration check
 */
export async function getWhatsAppAnalyticsData(
  organizationId: string
): Promise<WhatsAppAnalytics> {
  const config = await getWhatsAppConfig(organizationId);

  // Check if WhatsApp is configured
  if (!config.phoneNumberId || !config.accessToken) {
    return {
      configured: false,
      configurationMessage:
        'WhatsApp no está configurado. Ve a Configuración para conectar tu cuenta de WhatsApp Business.',
    };
  }

  // Fetch data from Meta API
  const analytics = await fetchWhatsAppAnalytics(config.phoneNumberId, config.accessToken);

  return {
    ...analytics,
    configured: analytics.configured ?? true,
  };
}

// ===============================================
// DATABASE ANALYTICS FUNCTIONS
// ===============================================

/**
 * Get total messages count and breakdown
 */
async function getTotalMessages(organizationId: string) {
  try {
    // Total messages
    const { count: totalMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    // Total sent (outgoing)
    const { count: totalSent } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('is_incoming', false);

    // Total received (incoming)
    const { count: totalReceived } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('is_incoming', true);

    return {
      totalMessages: totalMessages || 0,
      totalSent: totalSent || 0,
      totalReceived: totalReceived || 0,
    };
  } catch (error) {
    console.error('Error fetching total messages:', error);
    return { totalMessages: 0, totalSent: 0, totalReceived: 0 };
  }
}

/**
 * Get active conversations count
 */
async function getActiveConversations(organizationId: string) {
  try {
    const { count } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'open');

    return count || 0;
  } catch (error) {
    console.error('Error fetching active conversations:', error);
    return 0;
  }
}

/**
 * Calculate average response time
 * This calculates the time between incoming message and first outgoing response
 */
async function getAverageResponseTime(organizationId: string): Promise<{
  formatted: string;
  seconds: number;
}> {
  try {
    // Get conversations with at least one incoming and one outgoing message
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .limit(100); // Sample last 100 conversations for performance

    if (!conversations || conversations.length === 0) {
      return { formatted: '0s', seconds: 0 };
    }

    const conversationIds = conversations.map((c) => c.id);

    // Get all messages for these conversations, ordered by time
    const { data: messages } = await supabase
      .from('messages')
      .select('conversation_id, created_at, is_incoming')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true });

    if (!messages || messages.length === 0) {
      return { formatted: '0s', seconds: 0 };
    }

    // Calculate response times per conversation
    const responseTimes: number[] = [];
    const messagesByConversation = messages.reduce((acc, msg) => {
      if (!acc[msg.conversation_id]) acc[msg.conversation_id] = [];
      acc[msg.conversation_id].push(msg);
      return acc;
    }, {} as Record<string, typeof messages>);

    Object.values(messagesByConversation).forEach((convMessages) => {
      for (let i = 0; i < convMessages.length - 1; i++) {
        const current = convMessages[i];
        const next = convMessages[i + 1];

        // If current is incoming and next is outgoing, calculate response time
        if (current.is_incoming && !next.is_incoming) {
          const responseTime =
            (new Date(next.created_at).getTime() - new Date(current.created_at).getTime()) /
            1000;
          responseTimes.push(responseTime);
        }
      }
    });

    if (responseTimes.length === 0) {
      return { formatted: '0s', seconds: 0 };
    }

    // Calculate average
    const avgSeconds = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

    // Format as "Xm Ys" or "Xs"
    const minutes = Math.floor(avgSeconds / 60);
    const seconds = Math.floor(avgSeconds % 60);

    const formatted =
      minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    return { formatted, seconds: avgSeconds };
  } catch (error) {
    console.error('Error calculating average response time:', error);
    return { formatted: '0s', seconds: 0 };
  }
}

/**
 * Calculate conversion rate (closed conversations with positive outcome vs total)
 * This is a simplified metric - adjust based on your business logic
 */
async function getConversionRate(organizationId: string): Promise<string> {
  try {
    const { count: totalConversations } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    const { count: closedConversations } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'closed');

    if (!totalConversations || totalConversations === 0) {
      return '0.0%';
    }

    const rate = ((closedConversations || 0) / totalConversations) * 100;
    return `${rate.toFixed(1)}%`;
  } catch (error) {
    console.error('Error calculating conversion rate:', error);
    return '0.0%';
  }
}

/**
 * Get messages per platform breakdown
 */
async function getMessagesPerPlatform(organizationId: string) {
  try {
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, platform, organization_id')
      .eq('organization_id', organizationId);

    if (!conversations) {
      return { whatsapp: 0, instagram: 0, messenger: 0, web: 0 };
    }

    const conversationIds = conversations.map((c) => c.id);

    const { data: messages } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', conversationIds);

    if (!messages) {
      return { whatsapp: 0, instagram: 0, messenger: 0, web: 0 };
    }

    // Count messages per platform
    const platformCounts = { whatsapp: 0, instagram: 0, messenger: 0, web: 0 };

    messages.forEach((msg) => {
      const conversation = conversations.find((c) => c.id === msg.conversation_id);
      if (conversation && conversation.platform) {
        const platform = conversation.platform.toLowerCase() as keyof typeof platformCounts;
        if (platformCounts.hasOwnProperty(platform)) {
          platformCounts[platform]++;
        }
      }
    });

    return platformCounts;
  } catch (error) {
    console.error('Error fetching messages per platform:', error);
    return { whatsapp: 0, instagram: 0, messenger: 0, web: 0 };
  }
}

/**
 * Get message volume for last 30 days
 */
async function getMessageVolumeLast30Days(organizationId: string) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: messages } = await supabase
      .from('messages')
      .select('created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (!messages || messages.length === 0) {
      return [];
    }

    // Group by date
    const volumeByDate: Record<string, number> = {};

    messages.forEach((msg) => {
      const date = new Date(msg.created_at).toISOString().split('T')[0];
      volumeByDate[date] = (volumeByDate[date] || 0) + 1;
    });

    // Convert to array and fill missing dates with 0
    const result = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        count: volumeByDate[dateStr] || 0,
      });
    }

    return result;
  } catch (error) {
    console.error('Error fetching message volume:', error);
    return [];
  }
}

/**
 * Get message volume for last 7 days
 */
async function getMessageVolumeLastWeek(organizationId: string) {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: messages } = await supabase
      .from('messages')
      .select('created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (!messages || messages.length === 0) {
      return [];
    }

    // Group by day of week
    const volumeByDay: Record<string, number> = {};
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    messages.forEach((msg) => {
      const date = new Date(msg.created_at);
      const dayName = dayNames[date.getDay()];
      volumeByDay[dayName] = (volumeByDay[dayName] || 0) + 1;
    });

    // Convert to array for last 7 days
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayName = dayNames[date.getDay()];
      result.push({
        day: dayName,
        count: volumeByDay[dayName] || 0,
      });
    }

    return result;
  } catch (error) {
    console.error('Error fetching weekly message volume:', error);
    return [];
  }
}

/**
 * Get campaign statistics
 */
async function getCampaignStats(organizationId: string) {
  try {
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('stats')
      .eq('organization_id', organizationId);

    if (!campaigns || campaigns.length === 0) {
      return { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
    }

    const totals = campaigns.reduce(
      (acc, campaign) => {
        const stats = campaign.stats as any;
        return {
          total: acc.total + 1,
          sent: acc.sent + (stats?.sent || 0),
          delivered: acc.delivered + (stats?.delivered || 0),
          read: acc.read + (stats?.read || 0),
          failed: acc.failed + (stats?.failed || 0),
        };
      },
      { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 }
    );

    return totals;
  } catch (error) {
    console.error('Error fetching campaign stats:', error);
    return { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
  }
}

/**
 * Get top performing agents
 */
async function getTopPerformingAgents(organizationId: string) {
  try {
    // Get conversations assigned to agents
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, assigned_to')
      .eq('organization_id', organizationId)
      .not('assigned_to', 'is', null);

    if (!conversations || conversations.length === 0) {
      return [];
    }

    // Get messages for these conversations
    const conversationIds = conversations.map((c) => c.id);

    const { data: messages } = await supabase
      .from('messages')
      .select('conversation_id, is_incoming, created_at')
      .in('conversation_id', conversationIds);

    if (!messages) {
      return [];
    }

    // Get agent profiles
    const agentIds = [...new Set(conversations.map((c) => c.assigned_to).filter(Boolean))];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', agentIds as string[]);

    if (!profiles) {
      return [];
    }

    // Calculate stats per agent
    const agentStats = agentIds.map((agentId) => {
      const agentConversations = conversations.filter((c) => c.assigned_to === agentId);
      const agentMessages = messages.filter((m) =>
        agentConversations.some((c) => c.id === m.conversation_id)
      );

      const profile = profiles.find((p) => p.id === agentId);

      return {
        id: agentId!,
        name: profile?.full_name || 'Unknown',
        messagesHandled: agentMessages.length,
        avgResponseTime: 0, // Simplified for now
      };
    });

    // Sort by messages handled and return top 5
    return agentStats.sort((a, b) => b.messagesHandled - a.messagesHandled).slice(0, 5);
  } catch (error) {
    console.error('Error fetching top performing agents:', error);
    return [];
  }
}

/**
 * Get conversations by status
 */
async function getConversationsByStatus(organizationId: string) {
  try {
    const { data: conversations } = await supabase
      .from('conversations')
      .select('status')
      .eq('organization_id', organizationId);

    if (!conversations) {
      return { open: 0, closed: 0, snoozed: 0 };
    }

    const counts = conversations.reduce(
      (acc, conv) => {
        const status = conv.status || 'open';
        if (status in acc) {
          acc[status as keyof typeof acc]++;
        }
        return acc;
      },
      { open: 0, closed: 0, snoozed: 0 }
    );

    return counts;
  } catch (error) {
    console.error('Error fetching conversations by status:', error);
    return { open: 0, closed: 0, snoozed: 0 };
  }
}

/**
 * Calculate percentage changes compared to previous period
 */
async function calculatePercentageChanges(
  organizationId: string
): Promise<{
  totalMessages: string;
  activeConversations: string;
  avgResponseTime: string;
  conversionRate: string;
}> {
  try {
    // Get current period (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get previous period (30-60 days ago)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Current period messages
    const { count: currentMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', thirtyDaysAgo.toISOString());

    // Previous period messages
    const { count: previousMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', sixtyDaysAgo.toISOString())
      .lt('created_at', thirtyDaysAgo.toISOString());

    // Calculate message change
    const messageChange = calculateChange(currentMessages || 0, previousMessages || 0);

    // Current active conversations
    const { data: currentConvs } = await supabase
      .from('conversations')
      .select('id, last_message_time')
      .eq('organization_id', organizationId)
      .eq('status', 'open')
      .gte('last_message_time', thirtyDaysAgo.toISOString());

    // Previous active conversations
    const { data: previousConvs } = await supabase
      .from('conversations')
      .select('id, last_message_time')
      .eq('organization_id', organizationId)
      .eq('status', 'open')
      .gte('last_message_time', sixtyDaysAgo.toISOString())
      .lt('last_message_time', thirtyDaysAgo.toISOString());

    const conversationChange = calculateChange(
      currentConvs?.length || 0,
      previousConvs?.length || 0
    );

    // Response time change (simplified - comparing averages)
    const currentResponseTime = await getAverageResponseTime(organizationId);
    
    // Get previous period response time
    const { data: prevMessages } = await supabase
      .from('messages')
      .select('conversation_id, created_at, is_incoming')
      .eq('organization_id', organizationId)
      .gte('created_at', sixtyDaysAgo.toISOString())
      .lt('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true })
      .limit(200);

    let previousAvgResponseTime = 0;
    if (prevMessages && prevMessages.length > 0) {
      const responseTimes: number[] = [];
      const messagesByConv = prevMessages.reduce((acc, msg) => {
        if (!acc[msg.conversation_id]) acc[msg.conversation_id] = [];
        acc[msg.conversation_id].push(msg);
        return acc;
      }, {} as Record<string, typeof prevMessages>);

      Object.values(messagesByConv).forEach((convMessages) => {
        for (let i = 0; i < convMessages.length - 1; i++) {
          const current = convMessages[i];
          const next = convMessages[i + 1];
          if (current.is_incoming && !next.is_incoming) {
            const responseTime =
              (new Date(next.created_at).getTime() - new Date(current.created_at).getTime()) / 1000;
            if (responseTime < 86400) responseTimes.push(responseTime);
          }
        }
      });

      previousAvgResponseTime =
        responseTimes.length > 0
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          : 0;
    }

    // For response time, lower is better, so invert the change
    const responseTimeChange =
      previousAvgResponseTime > 0
        ? calculateChange(previousAvgResponseTime, currentResponseTime.seconds)
        : '0%';

    // Conversion rate change
    const { count: currentTotal } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('last_message_time', thirtyDaysAgo.toISOString());

    const { count: currentClosed } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'closed')
      .gte('last_message_time', thirtyDaysAgo.toISOString());

    const { count: previousTotal } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('last_message_time', sixtyDaysAgo.toISOString())
      .lt('last_message_time', thirtyDaysAgo.toISOString());

    const { count: previousClosed } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'closed')
      .gte('last_message_time', sixtyDaysAgo.toISOString())
      .lt('last_message_time', thirtyDaysAgo.toISOString());

    const currentRate = currentTotal ? ((currentClosed || 0) / currentTotal) * 100 : 0;
    const previousRate = previousTotal ? ((previousClosed || 0) / previousTotal) * 100 : 0;

    const conversionRateChange = calculateChange(currentRate, previousRate);

    return {
      totalMessages: messageChange,
      activeConversations: conversationChange,
      avgResponseTime: responseTimeChange,
      conversionRate: conversionRateChange,
    };
  } catch (error) {
    console.error('Error calculating percentage changes:', error);
    return {
      totalMessages: '0%',
      activeConversations: '0%',
      avgResponseTime: '0%',
      conversionRate: '0%',
    };
  }
}

/**
 * Helper function to calculate percentage change
 */
function calculateChange(current: number, previous: number): string {
  if (previous === 0) {
    return current > 0 ? '+100%' : '0%';
  }

  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(change * 10) / 10; // Round to 1 decimal

  if (rounded > 0) {
    return `+${rounded}%`;
  } else if (rounded < 0) {
    return `${rounded}%`;
  } else {
    return '0%';
  }
}

/**
 * Get all database analytics
 */
export async function getDatabaseAnalytics(
  organizationId: string
): Promise<DatabaseAnalytics> {
  try {
    // Fetch all analytics in parallel for better performance
    const [
      messageStats,
      activeConversations,
      avgResponseTime,
      conversionRate,
      messagesPerPlatform,
      messageVolume30Days,
      messageVolumeWeek,
      campaignStats,
      topAgents,
      conversationsByStatus,
      percentageChanges,
    ] = await Promise.all([
      getTotalMessages(organizationId),
      getActiveConversations(organizationId),
      getAverageResponseTime(organizationId),
      getConversionRate(organizationId),
      getMessagesPerPlatform(organizationId),
      getMessageVolumeLast30Days(organizationId),
      getMessageVolumeLastWeek(organizationId),
      getCampaignStats(organizationId),
      getTopPerformingAgents(organizationId),
      getConversationsByStatus(organizationId),
      calculatePercentageChanges(organizationId),
    ]);

    return {
      totalMessages: messageStats.totalMessages,
      totalSent: messageStats.totalSent,
      totalReceived: messageStats.totalReceived,
      activeConversations,
      avgResponseTime: avgResponseTime.formatted,
      avgResponseTimeSeconds: avgResponseTime.seconds,
      conversionRate,
      messagesPerPlatform,
      messageVolumeLast30Days: messageVolume30Days,
      messageVolumeLastWeek: messageVolumeWeek,
      campaignStats,
      topPerformingAgents: topAgents,
      conversationsByStatus,
      changes: percentageChanges,
    };
  } catch (error) {
    console.error('Error fetching database analytics:', error);
    throw error;
  }
}

// ===============================================
// MAIN ANALYTICS FUNCTION
// ===============================================

/**
 * Get complete analytics dashboard data
 * Combines WhatsApp API data and database analytics
 */
export async function getAnalyticsDashboardData(
  organizationId: string
): Promise<AnalyticsDashboardData> {
  try {
    console.log('📊 Fetching analytics dashboard data for org:', organizationId);

    // Fetch WhatsApp and Database analytics in parallel
    const [whatsappData, databaseData] = await Promise.all([
      getWhatsAppAnalyticsData(organizationId),
      getDatabaseAnalytics(organizationId),
    ]);

    return {
      whatsapp: whatsappData,
      database: databaseData,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error fetching analytics dashboard data:', error);
    throw error;
  }
}
