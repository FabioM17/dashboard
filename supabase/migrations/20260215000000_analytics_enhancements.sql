-- =====================================================
-- ANALYTICS ENHANCEMENTS MIGRATION
-- Created: 2026-02-15
-- Description: Adds indexes and functions to improve analytics performance
-- =====================================================

-- =====================================================
-- PERFORMANCE INDEXES FOR ANALYTICS
-- =====================================================

-- Index for filtering messages by organization, direction, and time (for response time calculations)
CREATE INDEX IF NOT EXISTS idx_messages_org_incoming_time 
ON public.messages (organization_id, is_incoming, created_at DESC)
WHERE organization_id IS NOT NULL;

-- Index for conversations by organization and status (for active/closed/snoozed counts)
CREATE INDEX IF NOT EXISTS idx_conversations_org_status 
ON public.conversations (organization_id, status)
WHERE organization_id IS NOT NULL;

-- Index for conversations by organization and platform (for platform statistics)
CREATE INDEX IF NOT EXISTS idx_conversations_org_platform 
ON public.conversations (organization_id, platform)
WHERE organization_id IS NOT NULL AND platform IS NOT NULL;

-- Index for messages by organization and AI status (for AI vs human metrics)
CREATE INDEX IF NOT EXISTS idx_messages_org_ai 
ON public.messages (organization_id, is_ai)
WHERE organization_id IS NOT NULL;

-- =====================================================
-- ANALYTICS HELPER FUNCTIONS
-- =====================================================

-- Function to get message counts by platform for an organization
CREATE OR REPLACE FUNCTION public.get_message_counts_by_platform(org_id UUID)
RETURNS TABLE(
  platform TEXT,
  message_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.platform,
    COUNT(m.id)::BIGINT as message_count
  FROM conversations c
  LEFT JOIN messages m ON m.conversation_id = c.id
  WHERE c.organization_id = org_id
    AND c.platform IS NOT NULL
  GROUP BY c.platform;
END;
$$;

COMMENT ON FUNCTION public.get_message_counts_by_platform(UUID) IS 
'Returns message counts grouped by platform (whatsapp, instagram, messenger, web) for a given organization';

-- Function to get conversation counts by status
CREATE OR REPLACE FUNCTION public.get_conversation_counts_by_status(org_id UUID)
RETURNS TABLE(
  status TEXT,
  conversation_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.status,
    COUNT(c.id)::BIGINT as conversation_count
  FROM conversations c
  WHERE c.organization_id = org_id
  GROUP BY c.status;
END;
$$;

COMMENT ON FUNCTION public.get_conversation_counts_by_status(UUID) IS 
'Returns conversation counts grouped by status (open, closed, snoozed) for a given organization';

-- Function to calculate average response time in seconds
CREATE OR REPLACE FUNCTION public.calculate_avg_response_time(
  org_id UUID,
  days_back INTEGER DEFAULT 7
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_time NUMERIC;
BEGIN
  -- Calculate average time between incoming message and first outgoing response
  -- within the same conversation
  WITH incoming_messages AS (
    SELECT 
      m.conversation_id,
      m.created_at as incoming_time,
      ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) as rn
    FROM messages m
    WHERE m.organization_id = org_id
      AND m.is_incoming = true
      AND m.created_at >= NOW() - INTERVAL '1 day' * days_back
  ),
  outgoing_responses AS (
    SELECT 
      m.conversation_id,
      m.created_at as outgoing_time,
      ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) as rn
    FROM messages m
    WHERE m.organization_id = org_id
      AND m.is_incoming = false
      AND m.created_at >= NOW() - INTERVAL '1 day' * days_back
  ),
  response_times AS (
    SELECT 
      EXTRACT(EPOCH FROM (o.outgoing_time - i.incoming_time)) as seconds
    FROM incoming_messages i
    INNER JOIN outgoing_responses o 
      ON i.conversation_id = o.conversation_id 
      AND o.outgoing_time > i.incoming_time
    WHERE o.rn = 1 -- First outgoing response after incoming
      AND i.rn = 1 -- First incoming message
      AND EXTRACT(EPOCH FROM (o.outgoing_time - i.incoming_time)) < 86400 -- Less than 24 hours
  )
  SELECT AVG(seconds) INTO avg_time FROM response_times;
  
  RETURN COALESCE(avg_time, 0);
END;
$$;

COMMENT ON FUNCTION public.calculate_avg_response_time(UUID, INTEGER) IS 
'Calculates average response time in seconds for an organization. Returns 0 if no data available.';

-- Function to get daily message volume for a date range
CREATE OR REPLACE FUNCTION public.get_daily_message_volume(
  org_id UUID,
  days_back INTEGER DEFAULT 30
)
RETURNS TABLE(
  message_date DATE,
  message_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(m.created_at) as message_date,
    COUNT(m.id)::BIGINT as message_count
  FROM messages m
  WHERE m.organization_id = org_id
    AND m.created_at >= NOW() - INTERVAL '1 day' * days_back
  GROUP BY DATE(m.created_at)
  ORDER BY message_date ASC;
END;
$$;

COMMENT ON FUNCTION public.get_daily_message_volume(UUID, INTEGER) IS 
'Returns daily message counts for the specified number of days back';

-- Function to get top performing agents
CREATE OR REPLACE FUNCTION public.get_top_agents_by_messages(
  org_id UUID,
  limit_count INTEGER DEFAULT 5
)
RETURNS TABLE(
  agent_id UUID,
  agent_name TEXT,
  messages_handled BIGINT,
  conversations_assigned BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as agent_id,
    COALESCE(p.full_name, p.email, 'Unknown') as agent_name,
    COUNT(DISTINCT m.id)::BIGINT as messages_handled,
    COUNT(DISTINCT c.id)::BIGINT as conversations_assigned
  FROM profiles p
  INNER JOIN conversations c ON c.assigned_to = p.id
  LEFT JOIN messages m ON m.conversation_id = c.id
  WHERE c.organization_id = org_id
    AND c.assigned_to IS NOT NULL
  GROUP BY p.id, p.full_name, p.email
  ORDER BY messages_handled DESC
  LIMIT limit_count;
END;
$$;

COMMENT ON FUNCTION public.get_top_agents_by_messages(UUID, INTEGER) IS 
'Returns top agents ranked by number of messages handled';

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions on analytics functions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_message_counts_by_platform(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_counts_by_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_avg_response_time(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_message_volume(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_agents_by_messages(UUID, INTEGER) TO authenticated;

-- =====================================================
-- ANALYTICS VIEW (OPTIONAL - FOR QUICK OVERVIEW)
-- =====================================================

-- Create a materialized view for quick analytics overview (optional)
-- Note: This needs to be refreshed periodically
CREATE MATERIALIZED VIEW IF NOT EXISTS public.analytics_overview AS
SELECT 
  o.id as organization_id,
  o.name as organization_name,
  COUNT(DISTINCT c.id) as total_conversations,
  COUNT(DISTINCT CASE WHEN c.status = 'open' THEN c.id END) as open_conversations,
  COUNT(DISTINCT CASE WHEN c.status = 'closed' THEN c.id END) as closed_conversations,
  COUNT(DISTINCT m.id) as total_messages,
  COUNT(DISTINCT CASE WHEN m.is_incoming THEN m.id END) as incoming_messages,
  COUNT(DISTINCT CASE WHEN NOT m.is_incoming THEN m.id END) as outgoing_messages,
  COUNT(DISTINCT CASE WHEN m.is_ai THEN m.id END) as ai_messages,
  NOW() as last_updated
FROM organizations o
LEFT JOIN conversations c ON c.organization_id = o.id
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY o.id, o.name;

-- Create index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_overview_org_id 
ON public.analytics_overview (organization_id);

COMMENT ON MATERIALIZED VIEW public.analytics_overview IS 
'Materialized view providing quick analytics overview per organization. Refresh periodically with: REFRESH MATERIALIZED VIEW CONCURRENTLY public.analytics_overview;';

-- Grant select permissions on the view
GRANT SELECT ON public.analytics_overview TO authenticated;

-- =====================================================
-- REFRESH FUNCTION FOR MATERIALIZED VIEW
-- =====================================================

-- Function to refresh analytics overview (can be called via cron or manually)
CREATE OR REPLACE FUNCTION public.refresh_analytics_overview()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.analytics_overview;
END;
$$;

COMMENT ON FUNCTION public.refresh_analytics_overview() IS 
'Refreshes the analytics_overview materialized view. Call this periodically to update cached statistics.';

GRANT EXECUTE ON FUNCTION public.refresh_analytics_overview() TO authenticated;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Analytics enhancements migration completed successfully!';
  RAISE NOTICE 'Created indexes for: messages (org+incoming+time), conversations (org+status), conversations (org+platform)';
  RAISE NOTICE 'Created analytics functions: get_message_counts_by_platform, get_conversation_counts_by_status, calculate_avg_response_time, get_daily_message_volume, get_top_agents_by_messages';
  RAISE NOTICE 'Created materialized view: analytics_overview';
  RAISE NOTICE 'To refresh analytics view, run: SELECT public.refresh_analytics_overview();';
END $$;
