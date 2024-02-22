CREATE TRIGGER set_public_layers_updated_at BEFORE UPDATE ON public.layers FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
CREATE TRIGGER set_public_features_updated_at BEFORE UPDATE ON public.features FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
