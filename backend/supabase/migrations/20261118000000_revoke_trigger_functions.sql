-- Trigger-only SECURITY DEFINER functions must not be callable through /rest/v1/rpc (Supabase advisor 0028/0029).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.snapshot_project() from public, anon, authenticated;
