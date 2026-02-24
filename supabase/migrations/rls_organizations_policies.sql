-- ============================================================================
-- RLS Policies for Organizations Table
-- ============================================================================
-- Políticas de Row Level Security para la tabla organizations
-- Permite a todos los usuarios autenticados ver el nombre y email de su organización
-- Solo admins pueden modificar estos datos
-- ============================================================================

-- IMPORTANTE: Asegúrate de que RLS esté habilitado en la tabla organizations
-- Si no está habilitado, ejecuta primero:
-- ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1. POLÍTICA DE LECTURA: Todos los usuarios de la org pueden ver
-- ============================================================================
CREATE POLICY "Users can view their organization details"
  ON public.organizations
  FOR SELECT
  USING (
    -- El usuario debe pertenecer a esta organización
    id IN (
      SELECT organization_id FROM public.profiles 
      WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- 2. POLÍTICA DE ACTUALIZACIÓN: Solo admins pueden modificar
-- ============================================================================
CREATE POLICY "Only admins can update organization details"
  ON public.organizations
  FOR UPDATE
  USING (
    -- El usuario debe ser admin de esta organización
    id IN (
      SELECT organization_id FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    -- Validación adicional al actualizar
    id IN (
      SELECT organization_id FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- 3. POLÍTICA DE INSERCIÓN: Solo admins (si aplica)
-- ============================================================================
CREATE POLICY "Only admins can create organizations"
  ON public.organizations
  FOR INSERT
  WITH CHECK (
    -- El usuario que intenta crear debe ser admin
    id IN (
      SELECT organization_id FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- 4. POLÍTICA DE ELIMINACIÓN: No permitir eliminación
-- ============================================================================
-- (Opcional: descomentar si quieres prevenir eliminaciones)
-- CREATE POLICY "No one can delete organizations"
--   ON public.organizations
--   FOR DELETE
--   USING (false);

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- Para verificar que las políticas están correctas, ejecuta:
-- 
-- SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'organizations';

-- ============================================================================
-- TESTING
-- ============================================================================
-- Para probar las políticas desde la aplicación:@supabase_supabase-js.js?v=50b66b7b:7099  GET https://gfavwcnokzypvazyoqod.supabase.co/rest/v1/organizations?select=*&id=eq.605a2c1c-4923-471c-ae79-135b4eaf27ff 406 (Not Acceptable)
(anonymous) @ @supabase_supabase-js.js?v=50b66b7b:7099
(anonymous) @ @supabase_supabase-js.js?v=50b66b7b:7120
fulfilled @ @supabase_supabase-js.js?v=50b66b7b:7072
Promise.then
step @ @supabase_supabase-js.js?v=50b66b7b:7085
(anonymous) @ @supabase_supabase-js.js?v=50b66b7b:7087
__awaiter2 @ @supabase_supabase-js.js?v=50b66b7b:7069
(anonymous) @ @supabase_supabase-js.js?v=50b66b7b:7110
then @ @supabase_supabase-js.js?v=50b66b7b:120
chatService.ts:548 Error fetching organization details: {code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'Cannot coerce the result to a single JSON object'}
-- 
-- 1. Como usuario no-admin:
--    - Debe poder VER el nombre y email de su organización
--    - NO debe poder MODIFICARLOS
-- 
-- 2. Como admin:
--    - Debe poder VER todos los campos
--    - Debe poder MODIFICAR nombre y support_email
-- 
-- 3. Usuario de otra organización:
--    - NO debe ver nada de esta organización

-- ============================================================================
-- ROLLBACK (si necesitas revertir)
-- ============================================================================
-- DROP POLICY IF EXISTS "Users can view their organization details" ON public.organizations;
-- DROP POLICY IF EXISTS "Only admins can update organization details" ON public.organizations;
-- DROP POLICY IF EXISTS "Only admins can create organizations" ON public.organizations;
