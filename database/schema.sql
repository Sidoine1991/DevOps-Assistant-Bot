-- Schema SQL pour DevOps Assistant Bot avec Supabase

-- Table pour stocker les conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    user_message TEXT NOT NULL,
    bot_response TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table pour stocker les configurations utilisateur
CREATE TABLE IF NOT EXISTS user_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE NOT NULL,
    api_key TEXT NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'openai',
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table pour stocker les métriques système
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cpu_usage DECIMAL(5,2) NOT NULL,
    memory_usage DECIMAL(5,2) NOT NULL,
    disk_usage DECIMAL(5,2) NOT NULL,
    active_users INTEGER DEFAULT 0,
    response_time_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table pour stocker les logs d'erreurs
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    context JSONB DEFAULT '{}',
    user_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table pour stocker les sessions utilisateur
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Table pour stocker les feedbacks utilisateur
CREATE TABLE IF NOT EXISTS user_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    feedback_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table pour stocker les analytics d'utilisation
CREATE TABLE IF NOT EXISTS usage_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_configs_user_id ON user_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_system_metrics_created_at ON system_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_feedback_conversation_id ON user_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_user_id ON usage_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_created_at ON usage_analytics(created_at DESC);

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers pour updated_at
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_configs_updated_at BEFORE UPDATE ON user_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) pour la sécurité
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_analytics ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour les conversations
CREATE POLICY "Users can view own conversations" ON conversations
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own conversations" ON conversations
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own conversations" ON conversations
    FOR UPDATE USING (auth.uid()::text = user_id);

-- Politiques RLS pour les configurations utilisateur
CREATE POLICY "Users can manage own config" ON user_configs
    FOR ALL USING (auth.uid()::text = user_id);

-- Politiques RLS pour les sessions
CREATE POLICY "Users can manage own sessions" ON user_sessions
    FOR ALL USING (auth.uid()::text = user_id);

-- Politiques RLS pour les feedbacks
CREATE POLICY "Users can manage own feedback" ON user_feedback
    FOR ALL USING (auth.uid()::text = user_id);

-- Politiques RLS pour les analytics (lecture seule pour les utilisateurs)
CREATE POLICY "Users can view own analytics" ON usage_analytics
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own analytics" ON usage_analytics
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Les tables system_metrics et error_logs sont accessibles en lecture seule pour le public
CREATE POLICY "Allow read access to system metrics" ON system_metrics
    FOR SELECT USING (true);

CREATE POLICY "Allow read access to error logs" ON system_metrics
    FOR SELECT USING (true);

-- Vue pour les statistiques du dashboard
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT 
    (SELECT COUNT(*) FROM conversations) as total_conversations,
    (SELECT COUNT(*) FROM user_sessions WHERE last_activity > NOW() - INTERVAL '1 hour') as active_users_1h,
    (SELECT COUNT(*) FROM user_sessions WHERE last_activity > NOW() - INTERVAL '24 hours') as active_users_24h,
    (SELECT COUNT(*) FROM error_logs WHERE created_at > NOW() - INTERVAL '24 hours') as recent_errors_24h,
    (SELECT cpu_usage FROM system_metrics ORDER BY created_at DESC LIMIT 1) as latest_cpu,
    (SELECT memory_usage FROM system_metrics ORDER BY created_at DESC LIMIT 1) as latest_memory,
    (SELECT disk_usage FROM system_metrics ORDER BY created_at DESC LIMIT 1) as latest_disk;

-- Fonction pour nettoyer les anciennes données
CREATE OR REPLACE FUNCTION cleanup_old_data(days_to_keep INTEGER DEFAULT 30)
RETURNS void AS $$
BEGIN
    DELETE FROM conversations WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;
    DELETE FROM system_metrics WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;
    DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;
    DELETE FROM user_sessions WHERE expires_at < NOW();
    DELETE FROM usage_analytics WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;
END;
$$ LANGUAGE plpgsql;

-- Commentaires pour la documentation
COMMENT ON TABLE conversations IS 'Stocke toutes les conversations entre utilisateurs et le bot';
COMMENT ON TABLE user_configs IS 'Stocke les configurations personnalisées des utilisateurs';
COMMENT ON TABLE system_metrics IS 'Stocke les métriques de performance du système';
COMMENT ON TABLE error_logs IS 'Stocke les logs d''erreurs pour le débogage';
COMMENT ON TABLE user_sessions IS 'Gère les sessions utilisateur actives';
COMMENT ON TABLE user_feedback IS 'Stocke les feedbacks et évaluations des utilisateurs';
COMMENT ON TABLE usage_analytics IS 'Stocke les événements d''utilisation pour les analytics';
