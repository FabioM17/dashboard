-- =====================================================
-- ANALYTICS OVERVIEW CLEANUP
-- Created: 2026-02-15
-- Description: Removes analytics_overview materialized view and related functions
-- Reason: Not needed - analyticsService.ts calculates everything in real-time using indexed tables
-- =====================================================

-- =====================================================
-- STEP 1: DROP ALL ANALYTICS_OVERVIEW RELATED OBJECTS
-- =====================================================

-- Drop functions first (they depend on views/tables)
DROP FUNCTION IF EXISTS public.get_analytics_overview_status() CASCADE;
DROP FUNCTION IF EXISTS public.get_analytics_overview() CASCADE;
DROP FUNCTION IF EXISTS public.refresh_analytics_overview() CASCADE;

-- Drop views (if exist)
DROP VIEW IF EXISTS public.analytics_overview CASCADE;

-- Drop materialized views (if exist)
DROP MATERIALIZED VIEW IF EXISTS public.analytics_overview_cache CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.analytics_overview CASCADE;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Analytics overview cleanup completed!';
  RAISE NOTICE '🗑️  Removed objects:';
  RAISE NOTICE '   - analytics_overview (materialized view)';
  RAISE NOTICE '   - analytics_overview_cache (materialized view)';
  RAISE NOTICE '   - analytics_overview (regular view)';
  RAISE NOTICE '   - get_analytics_overview() (function)';
  RAISE NOTICE '   - refresh_analytics_overview() (function)';
  RAISE NOTICE '   - get_analytics_overview_status() (function)';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Analytics now calculated in real-time by analyticsService.ts';
  RAISE NOTICE '✅ Performance optimized with indexes from previous migration';
  RAISE NOTICE '🔒 Security enforced by RLS on base tables (messages, conversations, etc.)';
END $$;
